# -*- coding: utf-8 -*-
"""방울이 수도요금 계산 통합 진입점.

계량기에서 검출된 숫자(누적 검침값)를 받아
사용량 → 요금 → 에너지/CO2를 한 번에 계산해서 돌려준다.

서버(FastAPI)는 이 한 줄만 알면 된다:

    from src.calculation import calc
    result = calc("seoul", 1020, 1043)        # 전월 1020㎥, 당월 1043㎥
    # -> {'사용량_㎥': 23.0, '요금': {...}, '영향': {...}}

요금표 파일 경로는 패키지가 알아서 찾으므로, 서버는 지역 코드만 넘기면 된다.
"""
from pathlib import Path

from . import engine
from . import impact

# 패키지에 포함된 지역별 요금표 폴더
RATES_DIR = Path(__file__).parent / "rates"


def available_regions():
    """요금표가 준비된 지역 코드 목록(예: seoul, busan ...)을 돌려준다."""
    return sorted(p.stem for p in RATES_DIR.glob("*.json") if not p.stem.startswith("_"))


def _load_region(region):
    path = RATES_DIR / f"{region}.json"
    if not path.exists():
        available = ", ".join(available_regions())
        raise ValueError(f"'{region}' 지역 요금표가 없습니다. 가능한 지역: {available}")
    return engine.load(path)


def calc_usage(region, usage_m3, *, usage_type="가정용", meter="auto", heating_co2_factor=None):
    """이미 알고 있는 한 달 사용량(㎥)으로 요금+에너지/CO2를 계산한다."""
    usage = float(usage_m3)
    if usage < 0:
        raise ValueError("사용량은 0 이상이어야 합니다.")

    table = _load_region(region)
    usage_type_n = engine.normalize_usage_type(usage_type)
    chosen_meter = engine.default_meter(table, usage_type_n) if meter in (None, "", "auto", "자동") else meter

    fee = engine.calc(table, usage_type_n, chosen_meter, usage)
    impact_result = impact.calc_impact(usage, heating_co2_factor_kg_per_kwh=heating_co2_factor)

    return {
        "지역": table.get("지역"),
        "수계": table.get("수계"),
        "용도": usage_type_n,
        "구경": chosen_meter,
        "사용량_㎥": usage,
        "요금": fee,
        "영향": impact_result,
    }


def calc(region, prev_reading_m3, curr_reading_m3, *, usage_type="가정용", meter="auto", heating_co2_factor=None):
    """검출된 검침값 2개(전월·당월)로 사용량·요금·에너지/CO2를 한 번에 계산한다.

    - region: 요금표 코드 (예: "seoul"). 목록은 available_regions() 참조.
    - prev_reading_m3 / curr_reading_m3: 계량기에 찍힌 누적 검침값(㎥).
    - meter: "auto"면 지역 기본 구경 자동 선택.
    - heating_co2_factor: 넣으면 온수 가열 CO2까지 총CO2에 합산(가스/전기/지역난방별 상이).
    """
    prev = float(prev_reading_m3)
    curr = float(curr_reading_m3)
    usage = curr - prev
    if usage < 0:
        raise ValueError(f"당월 검침값({curr})이 전월({prev})보다 작습니다. 검침값을 확인하세요.")

    result = calc_usage(region, usage, usage_type=usage_type, meter=meter, heating_co2_factor=heating_co2_factor)
    result["전월_검침_㎥"] = prev
    result["당월_검침_㎥"] = curr
    return result


def calc_history(region, readings, *, usage_type="가정용", meter="auto", heating_co2_factor=None):
    """시간순 검침값 여러 개를 받아 인접 구간마다 사용량·요금을 계산한다.

    월별 그래프나 기간별 사용량 화면에 쓴다. 검침값을 언제 쟀는지(날짜·월)는
    모듈이 해석하지 않고 'label'로 그대로 받아 결과에 붙여준다. 검침 기록을
    저장·조회하는 일은 서버(DB) 몫이고, 이 함수는 그 기록을 구간별 숫자로 바꿔준다.

    - readings: 시간 오름차순. 각 항목은 (label, reading_m3) 튜플 또는
      {"label": "2026-05", "reading_m3": 1043} 딕셔너리.
    - 반환: 구간 리스트. 각 항목 = calc() 결과 + {"시작_라벨", "끝_라벨"}.
    """
    normalized = []
    for item in readings:
        if isinstance(item, dict):
            label = item.get("label", item.get("라벨"))
            value = item.get("reading_m3", item.get("검침_m3", item.get("검침")))
        else:
            label, value = item
        normalized.append((label, float(value)))

    if len(normalized) < 2:
        raise ValueError("구간 사용량을 내려면 검침값이 최소 2개 있어야 합니다.")

    periods = []
    for (prev_label, prev_value), (curr_label, curr_value) in zip(normalized, normalized[1:]):
        period = calc(region, prev_value, curr_value, usage_type=usage_type, meter=meter, heating_co2_factor=heating_co2_factor)
        period["시작_라벨"] = prev_label
        period["끝_라벨"] = curr_label
        periods.append(period)
    return periods


def _selftest():
    # seoul 전월 1020 → 당월 1043 = 23㎥
    r = calc("seoul", 1020, 1043)
    assert r["사용량_㎥"] == 23.0, r
    assert r["전월_검침_㎥"] == 1020.0 and r["당월_검침_㎥"] == 1043.0, r
    # 사용량 직접 호출과 요금이 일치해야 함
    r2 = calc_usage("seoul", 23)
    assert r["요금"] == r2["요금"], (r["요금"], r2["요금"])
    assert r["요금"]["합계"] > 0, r["요금"]
    assert r["영향"]["사용량_㎥"] == 23.0, r["영향"]
    # 검침 역전 방어
    try:
        calc("seoul", 1043, 1020)
    except ValueError:
        pass
    else:
        raise AssertionError("검침값 역전인데 에러가 안 났습니다.")
    # 이력: 월별 검침값 3개 → 구간 2개
    history = calc_history("seoul", [("2026-03", 1000), ("2026-04", 1020), ("2026-05", 1043)])
    assert len(history) == 2, history
    assert history[0]["사용량_㎥"] == 20.0 and history[1]["사용량_㎥"] == 23.0, history
    assert history[1]["시작_라벨"] == "2026-04" and history[1]["끝_라벨"] == "2026-05", history
    print("[self-test] 통과 ✔  seoul 1020→1043 =", r["사용량_㎥"], "㎥, 합계", f'{r["요금"]["합계"]:,}원')
    print("[self-test] 통과 ✔  calc_history 3검침 → 구간", [f'{g["시작_라벨"]}~{g["끝_라벨"]} {g["사용량_㎥"]:g}㎥' for g in history])


if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    _selftest()
