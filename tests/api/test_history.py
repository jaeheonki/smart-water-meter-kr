# GET /history, GET /history/period 테스트
#
# 날짜별 검침 기록이 필요하므로 session fixture로 Reading을 직접 삽입한다.
# calc_history()는 실제 계산 모듈을 사용한다 (mock 없음).

from datetime import datetime
from src.api.models import Reading

HEADERS_A = {"X-Device-ID": "device-A"}


def _r(session, device_id, reading_m3, year, month):
    """Reading을 지정 월에 직접 삽입하는 헬퍼."""
    session.add(Reading(
        device_id=device_id,
        reading_m3=reading_m3,
        confidence=None,
        input_mode="manual",
        recorded_at=datetime(year, month, 15),
    ))
    session.commit()


# ─────────────────────────────────────────────
# GET /history
# ─────────────────────────────────────────────

def test_history_empty(client):
    """검침 기록 없으면 빈 리스트."""
    resp = client.get("/history", headers=HEADERS_A)
    assert resp.status_code == 200
    assert resp.json() == []


def test_history_one_reading(client, session):
    """검침 1개면 구간 계산 불가 → 빈 리스트."""
    _r(session, "device-A", 1000.0, 2026, 1)
    client.put("/settings", json={"region": "seoul"}, headers=HEADERS_A)
    assert client.get("/history", headers=HEADERS_A).json() == []


def test_history_two_readings(client, session):
    """검침 2개 → 구간 1개."""
    _r(session, "device-A", 1000.0, 2026, 1)
    _r(session, "device-A", 1023.0, 2026, 2)
    client.put("/settings", json={"region": "seoul"}, headers=HEADERS_A)
    items = client.get("/history", headers=HEADERS_A).json()
    assert len(items) == 1
    assert items[0]["start_label"] == "2026-01-15"
    assert items[0]["end_label"] == "2026-02-15"
    assert items[0]["usage_m3"] == 23.0
    assert items[0]["bill_total"] > 0
    assert items[0]["co2_kg"] > 0


def test_history_most_recent_first(client, session):
    """3개 검침 → 2개 구간, 최신 구간이 먼저."""
    _r(session, "device-A", 1000.0, 2026, 1)
    _r(session, "device-A", 1020.0, 2026, 2)
    _r(session, "device-A", 1043.0, 2026, 3)
    client.put("/settings", json={"region": "seoul"}, headers=HEADERS_A)
    items = client.get("/history", headers=HEADERS_A).json()
    assert len(items) == 2
    assert items[0]["start_label"] == "2026-02-15"  # 최신 구간
    assert items[0]["end_label"] == "2026-03-15"
    assert items[1]["start_label"] == "2026-01-15"  # 이전 구간


def test_history_no_region(client, session):
    """지역 미설정이면 빈 리스트."""
    _r(session, "device-A", 1000.0, 2026, 1)
    _r(session, "device-A", 1023.0, 2026, 2)
    assert client.get("/history", headers=HEADERS_A).json() == []


def test_history_missing_header(client):
    """X-Device-ID 헤더 없으면 400."""
    assert client.get("/history").status_code == 400


# ─────────────────────────────────────────────
# GET /history/period
# ─────────────────────────────────────────────

def test_history_period_filter(client, session):
    """start~end 범위 내 구간만 반환한다."""
    _r(session, "device-A", 1000.0, 2026, 1)
    _r(session, "device-A", 1020.0, 2026, 2)
    _r(session, "device-A", 1043.0, 2026, 3)
    _r(session, "device-A", 1060.0, 2026, 4)
    client.put("/settings", json={"region": "seoul"}, headers=HEADERS_A)

    items = client.get("/history/period?start=2026-02-15&end=2026-03-15", headers=HEADERS_A).json()
    assert len(items) == 1
    assert items[0]["start_label"] == "2026-02-15"
    assert items[0]["end_label"] == "2026-03-15"


def test_history_period_invalid_format(client):
    """YYYY-MM-DD 형식이 아니면 422."""
    resp = client.get("/history/period?start=2026-01&end=2026-06", headers=HEADERS_A)
    assert resp.status_code == 422


def test_history_period_missing_header(client):
    """X-Device-ID 헤더 없으면 400."""
    assert client.get("/history/period?start=2026-01-01&end=2026-06-30").status_code == 400
