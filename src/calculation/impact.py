# -*- coding: utf-8 -*-
"""방울이 물-에너지 영향 계산식.

요금 계산(engine.py)과 분리해서 물 사용량을 에너지와 CO2로 환산한다.
상하수도 전력 CO2와 온수 가열 에너지는 성격이 다르므로 기본 출력에서 분리한다.

사용:
    from impact import calc_impact, calc_saving
    calc_impact(20)
    calc_saving(baseline_m3=22, actual_m3=20)
"""
from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path


# 공개 자료 기반 계수. 출처 요약은 루트 참고데이터_수집결과.md 참조.
WATER_SUPPLY_KWH_PER_M3 = 0.23
WASTEWATER_KWH_PER_M3 = 0.4549
GRID_KG_CO2_PER_KWH = 0.4173

# 온수 가열 기본 가정.
HOT_WATER_SHARE = 0.45
WATER_SPECIFIC_HEAT_KJ_PER_KG_C = 4.186
HOT_WATER_DELTA_C = 45.0
BOILER_EFFICIENCY = 0.85

LITERS_PER_M3 = 1000.0
KJ_PER_KWH = 3600.0


def _round_tree(value, digits=3):
    if isinstance(value, float):
        return round(value, digits)
    if isinstance(value, dict):
        return {k: _round_tree(v, digits) for k, v in value.items()}
    return value


def calc_impact(
    usage_m3,
    *,
    hot_water_share=HOT_WATER_SHARE,
    inlet_to_hot_delta_c=HOT_WATER_DELTA_C,
    boiler_efficiency=BOILER_EFFICIENCY,
    heating_co2_factor_kg_per_kwh=None,
):
    """사용량(㎥)을 물-에너지 영향값으로 환산한다.

    heating_co2_factor_kg_per_kwh를 넣으면 온수 가열 CO2도 계산한다.
    넣지 않으면 온수는 에너지(kWh)만 계산하고 CO2에는 합산하지 않는다.
    """
    usage_m3 = float(usage_m3)
    if usage_m3 < 0:
        raise ValueError("usage_m3 must be >= 0")
    if not 0 <= hot_water_share <= 1:
        raise ValueError("hot_water_share must be between 0 and 1")
    if boiler_efficiency <= 0:
        raise ValueError("boiler_efficiency must be > 0")

    usage_l = usage_m3 * LITERS_PER_M3

    supply_kwh = usage_m3 * WATER_SUPPLY_KWH_PER_M3
    wastewater_kwh = usage_m3 * WASTEWATER_KWH_PER_M3
    water_system_kwh = supply_kwh + wastewater_kwh
    water_system_co2_kg = water_system_kwh * GRID_KG_CO2_PER_KWH

    hot_water_m3 = usage_m3 * hot_water_share
    hot_water_l = hot_water_m3 * LITERS_PER_M3
    hot_water_input_kwh = (
        hot_water_l
        * WATER_SPECIFIC_HEAT_KJ_PER_KG_C
        * inlet_to_hot_delta_c
        / KJ_PER_KWH
        / boiler_efficiency
    )

    heating_co2_kg = None
    if heating_co2_factor_kg_per_kwh is not None:
        heating_co2_kg = hot_water_input_kwh * float(heating_co2_factor_kg_per_kwh)

    total_energy_kwh = water_system_kwh + hot_water_input_kwh
    total_co2_kg = water_system_co2_kg if heating_co2_kg is None else water_system_co2_kg + heating_co2_kg

    return {
        "사용량_㎥": usage_m3,
        "사용량_L": usage_l,
        "상하수도_전력_kWh": water_system_kwh,
        "상수도_전력_kWh": supply_kwh,
        "하수도_전력_kWh": wastewater_kwh,
        "상하수도_전력_CO2_kg": water_system_co2_kg,
        "온수_비율": hot_water_share,
        "온수량_㎥": hot_water_m3,
        "온수량_L": hot_water_l,
        "온수_가열에너지_kWh": hot_water_input_kwh,
        "온수_CO2_kg": heating_co2_kg,
        "총에너지_kWh": total_energy_kwh,
        "총CO2_kg": total_co2_kg,
        "총CO2_범위": "상하수도 전력만" if heating_co2_kg is None else "상하수도 전력 + 온수 가열",
        "계수": {
            "상수도_kWh_per_㎥": WATER_SUPPLY_KWH_PER_M3,
            "하수도_kWh_per_㎥": WASTEWATER_KWH_PER_M3,
            "전력배출계수_kgCO2_per_kWh": GRID_KG_CO2_PER_KWH,
            "물_비열_kJ_per_kgC": WATER_SPECIFIC_HEAT_KJ_PER_KG_C,
            "온도차_C": inlet_to_hot_delta_c,
            "보일러효율": boiler_efficiency,
            "온수_CO2계수_kg_per_kWh": heating_co2_factor_kg_per_kwh,
        },
    }


def calc_saving(
    baseline_m3,
    actual_m3,
    *,
    baseline_fee=None,
    actual_fee=None,
    **impact_options,
):
    """기준 사용량과 실제 사용량의 절감 효과를 계산한다."""
    baseline = calc_impact(baseline_m3, **impact_options)
    actual = calc_impact(actual_m3, **impact_options)
    saved_m3 = float(baseline_m3) - float(actual_m3)

    saved = {}
    for key in (
        "사용량_㎥",
        "사용량_L",
        "상하수도_전력_kWh",
        "상하수도_전력_CO2_kg",
        "온수량_㎥",
        "온수량_L",
        "온수_가열에너지_kWh",
        "총에너지_kWh",
        "총CO2_kg",
    ):
        if baseline[key] is None or actual[key] is None:
            saved[key] = None
        else:
            saved[key] = baseline[key] - actual[key]

    fee_saving = None
    if baseline_fee is not None and actual_fee is not None:
        fee_saving = int(round(float(baseline_fee) - float(actual_fee)))

    return {
        "기준": baseline,
        "실제": actual,
        "절감": saved,
        "절감_㎥": saved_m3,
        "절감률": None if baseline_m3 == 0 else saved_m3 / float(baseline_m3),
        "절감요금_원": fee_saving,
    }


def calc_from_readings(previous_reading_m3, current_reading_m3, **impact_options):
    """검침값 두 개로 사용량과 영향값을 계산한다."""
    previous_reading_m3 = float(previous_reading_m3)
    current_reading_m3 = float(current_reading_m3)
    usage_m3 = current_reading_m3 - previous_reading_m3
    if usage_m3 < 0:
        raise ValueError("current_reading_m3 must be >= previous_reading_m3")
    result = calc_impact(usage_m3, **impact_options)
    result["이전검침_㎥"] = previous_reading_m3
    result["현재검침_㎥"] = current_reading_m3
    return result


def calc_report(rate_file, usage_m3, *, usage_type="가정용", meter="auto", baseline_m3=None, **impact_options):
    """지역 요금표와 영향 계산을 합친 앱용 리포트를 만든다."""
    try:  # 패키지(calculation.impact)로 import될 때와 단독 실행 둘 다 지원
        from . import engine
    except ImportError:
        import engine

    table = engine.load(rate_file)
    normalized_usage_type = engine.normalize_usage_type(usage_type)
    chosen_meter = engine.default_meter(table, normalized_usage_type) if meter in (None, "", "auto", "자동") else meter
    fee = engine.calc(table, normalized_usage_type, chosen_meter, usage_m3)
    impact = calc_impact(usage_m3, **impact_options)

    report = {
        "지역": table.get("지역"),
        "수계": table.get("수계"),
        "용도": normalized_usage_type,
        "구경": chosen_meter,
        "사용량_㎥": float(usage_m3),
        "요금": fee,
        "영향": impact,
    }

    if baseline_m3 is not None:
        baseline_fee = engine.calc(table, normalized_usage_type, chosen_meter, baseline_m3)
        report["기준사용량_㎥"] = float(baseline_m3)
        report["기준요금"] = baseline_fee
        report["절감"] = calc_saving(
            baseline_m3,
            usage_m3,
            baseline_fee=baseline_fee["합계"],
            actual_fee=fee["합계"],
            **impact_options,
        )

    return report


def _selftest():
    got = calc_impact(1)
    assert round(got["상하수도_전력_kWh"], 4) == 0.6849, got
    assert round(got["상하수도_전력_CO2_kg"], 4) == 0.2858, got
    assert round(got["온수량_L"], 1) == 450.0, got
    assert round(got["온수_가열에너지_kWh"], 3) == 27.701, got

    saved = calc_saving(22, 20)
    assert round(saved["절감"]["사용량_㎥"], 3) == 2.0, saved
    assert round(saved["절감률"], 4) == 0.0909, saved

    readings = calc_from_readings(1020.5, 1023.0)
    assert readings["사용량_㎥"] == 2.5, readings
    print("[self-test] 통과")


def _print_human(result):
    rounded = _round_tree(deepcopy(result))
    print(json.dumps(rounded, ensure_ascii=False, indent=2))


def main(argv=None):
    parser = argparse.ArgumentParser(description="방울이 물-에너지 영향 계산")
    sub = parser.add_subparsers(dest="command")

    impact = sub.add_parser("impact", help="사용량 ㎥ 기준 환산")
    impact.add_argument("usage_m3", type=float)
    impact.add_argument("--hot-water-share", type=float, default=HOT_WATER_SHARE)
    impact.add_argument("--heating-co2-factor", type=float)

    readings = sub.add_parser("readings", help="이전/현재 검침값 기준 환산")
    readings.add_argument("previous_m3", type=float)
    readings.add_argument("current_m3", type=float)
    readings.add_argument("--hot-water-share", type=float, default=HOT_WATER_SHARE)
    readings.add_argument("--heating-co2-factor", type=float)

    saving = sub.add_parser("saving", help="기준/실제 사용량 절감 계산")
    saving.add_argument("baseline_m3", type=float)
    saving.add_argument("actual_m3", type=float)
    saving.add_argument("--baseline-fee", type=float)
    saving.add_argument("--actual-fee", type=float)
    saving.add_argument("--hot-water-share", type=float, default=HOT_WATER_SHARE)
    saving.add_argument("--heating-co2-factor", type=float)

    report = sub.add_parser("report", help="지역 요금 + 영향 통합 계산")
    report.add_argument("rate_file", type=Path)
    report.add_argument("usage_m3", type=float)
    report.add_argument("--usage-type", default="가정용")
    report.add_argument("--meter", default="auto")
    report.add_argument("--baseline-m3", type=float)
    report.add_argument("--hot-water-share", type=float, default=HOT_WATER_SHARE)
    report.add_argument("--heating-co2-factor", type=float)

    args = parser.parse_args(argv)
    if args.command is None:
        _selftest()
        return 0

    options = {
        "hot_water_share": args.hot_water_share,
        "heating_co2_factor_kg_per_kwh": args.heating_co2_factor,
    }
    if args.command == "impact":
        result = calc_impact(args.usage_m3, **options)
    elif args.command == "readings":
        result = calc_from_readings(args.previous_m3, args.current_m3, **options)
    elif args.command == "saving":
        result = calc_saving(
            args.baseline_m3,
            args.actual_m3,
            baseline_fee=args.baseline_fee,
            actual_fee=args.actual_fee,
            **options,
        )
    elif args.command == "report":
        result = calc_report(
            args.rate_file,
            args.usage_m3,
            usage_type=args.usage_type,
            meter=args.meter,
            baseline_m3=args.baseline_m3,
            **options,
        )
    else:
        raise ValueError(args.command)

    _print_human(result)
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    raise SystemExit(main())
