# GET /history, GET /history/period 테스트
#
# 날짜별 검침 기록이 필요하므로 session fixture로 Reading을 직접 삽입한다.
# calc_history()는 실제 계산 모듈을 사용한다 (mock 없음).

from datetime import datetime
from sqlmodel import select
from src.api.models import Reading

HEADERS_A = {"X-Device-ID": "device-A"}


def _r(session, device_id, reading_m3, year, month, is_baseline=False, input_mode="manual"):
    """Reading을 지정 월에 직접 삽입하는 헬퍼."""
    session.add(Reading(
        device_id=device_id,
        reading_m3=reading_m3,
        confidence=None,
        input_mode=input_mode,
        recorded_at=datetime(year, month, 15),
        is_baseline=is_baseline,
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


def test_history_labels_use_seoul_dates_across_day_month_and_year(client, session):
    rows = [
        (1000.0, datetime(2026, 7, 19, 16, 0)),
        (1001.0, datetime(2026, 7, 31, 16, 0)),
        (1002.0, datetime(2026, 12, 31, 16, 0)),
    ]
    for reading_m3, recorded_at in rows:
        session.add(Reading(
            device_id="device-A",
            reading_m3=reading_m3,
            confidence=None,
            input_mode="manual",
            recorded_at=recorded_at,
        ))
    session.commit()

    items = client.get("/history", headers=HEADERS_A).json()

    assert [(item["start_label"], item["end_label"]) for item in reversed(items)] == [
        ("2026-07-20", "2026-08-01"),
        ("2026-08-01", "2027-01-01"),
    ]


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


def test_history_no_region_defaults_to_seoul(client, session):
    """지역 미설정이면 서울 기준으로 계산한다."""
    _r(session, "device-A", 1000.0, 2026, 1)
    _r(session, "device-A", 1023.0, 2026, 2)
    items = client.get("/history", headers=HEADERS_A).json()
    assert len(items) == 1
    assert items[0]["bill_total"] > 0


def test_history_replacement_skips_only_pair_entering_baseline(client, session):
    """계량기 교체 직전 구간만 제외하고 전후의 정상 구간은 계산한다."""
    _r(session, "device-A", 1000.0, 2026, 1)
    _r(session, "device-A", 1100.0, 2026, 2)
    _r(session, "device-A", 20.0, 2026, 3, is_baseline=True)
    _r(session, "device-A", 35.0, 2026, 4)
    client.put("/settings", json={"region": "seoul"}, headers=HEADERS_A)

    items = client.get("/history", headers=HEADERS_A).json()

    assert [(item["start_label"], item["end_label"], item["usage_m3"]) for item in items] == [
        ("2026-03-15", "2026-04-15", 15.0),
        ("2026-01-15", "2026-02-15", 100.0),
    ]


def test_history_skips_legacy_decrease_without_mutating_readings(client, session):
    """기준점 도입 전 감소 구간은 제외하고 이후 정상 구간을 계산한다."""
    _r(session, "device-A", 100.0, 2026, 1)
    _r(session, "device-A", 20.0, 2026, 2)
    _r(session, "device-A", 35.0, 2026, 3)

    response = client.get("/history", headers=HEADERS_A)

    assert response.status_code == 200
    assert [(item["start_label"], item["end_label"], item["usage_m3"]) for item in response.json()] == [
        ("2026-02-15", "2026-03-15", 15.0),
    ]
    readings = session.exec(
        select(Reading)
        .where(Reading.device_id == "device-A")
        .order_by(Reading.recorded_at.asc())
    ).all()
    assert [(reading.reading_m3, reading.is_baseline) for reading in readings] == [
        (100.0, False),
        (20.0, False),
        (35.0, False),
    ]


def test_history_missing_header(client):
    """X-Device-ID 헤더 없으면 400."""
    assert client.get("/history").status_code == 400


def test_replacement_history_returns_latest_baseline_first(client, session):
    _r(session, "device-A", 1000.0, 2026, 1)
    _r(session, "device-A", 20.0, 2026, 2, is_baseline=True, input_mode="auto")
    _r(session, "device-A", 35.0, 2026, 3)
    _r(session, "device-A", 5.0, 2026, 4, is_baseline=True)

    response = client.get("/history/replacements", headers=HEADERS_A)

    assert response.status_code == 200
    assert response.json() == [
        {
            "replaced_at": "2026-04-15T00:00:00",
            "previous_reading_m3": 35.0,
            "baseline_reading_m3": 5.0,
            "input_mode": "manual",
        },
        {
            "replaced_at": "2026-02-15T00:00:00",
            "previous_reading_m3": 1000.0,
            "baseline_reading_m3": 20.0,
            "input_mode": "auto",
        },
    ]


def test_replacement_history_is_device_scoped_and_allows_missing_previous(client, session):
    _r(session, "device-A", 7.0, 2026, 2, is_baseline=True)
    _r(session, "device-B", 900.0, 2026, 1)
    _r(session, "device-B", 10.0, 2026, 2, is_baseline=True)

    response = client.get("/history/replacements", headers=HEADERS_A)

    assert response.status_code == 200
    assert response.json()[0]["previous_reading_m3"] is None
    assert len(response.json()) == 1


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
