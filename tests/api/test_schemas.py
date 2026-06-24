# 스키마 유효성 및 calc() 키 변환 함수 테스트
import pytest
from datetime import datetime, timezone
from src.api.schemas import map_calc_result, ManualResponse

SAMPLE_CALC = {
    "사용량_㎥": 23.0,
    "요금": {
        "상수도": 14420,
        "하수도": 11040,
        "물이용부담금": 3910,
        "부가세": 0,
        "합계": 29370,
    },
    "영향": {
        "상하수도_전력_kWh": 15.7527,
        "총CO2_kg": 6.57360171,
    },
    "전월_검침_㎥": 1020.0,
}


def test_map_calc_result_keys():
    result = map_calc_result(SAMPLE_CALC)
    assert result["usage_m3"] == 23.0
    assert result["prev_reading_m3"] == 1020.0
    assert result["bill"].total == 29370
    assert result["bill"].water == 14420
    assert result["impact"].co2_kg == pytest.approx(6.57, abs=0.01)
    assert result["impact"].energy_kwh == pytest.approx(15.75, abs=0.01)


def test_manual_response_first_reading():
    resp = ManualResponse(
        reading_m3=1043.0,
        recorded_at=datetime.now(timezone.utc),
        first_reading=True,
        usage_m3=None,
        prev_reading_m3=None,
        bill=None,
        impact=None,
    )
    assert resp.first_reading is True
    assert resp.bill is None


def test_manual_response_normal():
    result = map_calc_result(SAMPLE_CALC)
    resp = ManualResponse(
        reading_m3=1043.0,
        recorded_at=datetime.now(timezone.utc),
        first_reading=False,
        **result,
    )
    assert resp.usage_m3 == 23.0
    assert resp.bill.total == 29370
    assert resp.impact.co2_kg == pytest.approx(6.57, abs=0.01)
