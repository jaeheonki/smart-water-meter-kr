# POST /meter/scan, POST /meter/manual 테스트
#
# scan: pipeline.run()을 monkeypatch로 대체 — YOLO 모델 없이 결과만 검증
# manual: 실제 calc() 호출 (계산 모듈 테스트 겸용)

import io
from concurrent.futures import ThreadPoolExecutor
from threading import Event, Lock

import src.api.db as _db
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel import select

from src.api.models import Reading


HEADERS_A = {"X-Device-ID": "device-A"}
HEADERS_B = {"X-Device-ID": "device-B"}


def _img():
    """업로드용 가짜 이미지 파일 — 테스트마다 새 BytesIO 생성."""
    return ("meter.jpg", io.BytesIO(b"fake-image"), "image/jpeg")


# ────────────────────────────────────────────────────────────────────────────
# /meter/scan
# ────────────────────────────────────────────────────────────────────────────

def test_scan_success(client, monkeypatch):
    """pipeline.run의 리터 단위 숫자열을 ㎥로 변환해 응답한다."""
    monkeypatch.setattr("src.model.pipeline.run", lambda path, **kw: [("234918", 0.91)])
    resp = client.post("/meter/scan", files={"image": _img()})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["reading_m3"] == 234.918
    assert abs(data["confidence"] - 0.91) < 0.001


def test_scan_failure(client, monkeypatch):
    """pipeline.run이 빈 리스트를 반환하면 success=False, 나머지 필드는 null."""
    monkeypatch.setattr("src.model.pipeline.run", lambda path, **kw: [])
    resp = client.post("/meter/scan", files={"image": _img()})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    assert data["reading_m3"] is None
    assert data["confidence"] is None


# ────────────────────────────────────────────────────────────────────────────
# /meter/manual
# ────────────────────────────────────────────────────────────────────────────

def test_manual_first_reading(client):
    """첫 검침이면 first_reading=True, 요금 필드는 null."""
    resp = client.post(
        "/meter/manual",
        json={"reading_m3": 1000.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["first_reading"] is True
    assert data["bill"] is None
    assert data["usage_m3"] is None


def test_manual_with_calc(client):
    """지역 설정 후 두 번째 검침부터 요금이 계산된다."""
    client.put("/settings", json={"region": "seoul"}, headers=HEADERS_A)
    client.post("/meter/manual", json={"reading_m3": 1000.0, "input_mode": "manual"}, headers=HEADERS_A)
    resp = client.post(
        "/meter/manual",
        json={"reading_m3": 1023.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["first_reading"] is False
    assert data["usage_m3"] == 23.0
    assert data["bill"] is not None
    assert data["bill"]["total"] > 0
    assert data["impact"] is not None


def test_manual_no_region_defaults_to_seoul(client):
    """지역 미설정이면 서울 기준으로 요금을 계산한다."""
    client.post("/meter/manual", json={"reading_m3": 1000.0, "input_mode": "manual"}, headers=HEADERS_A)
    resp = client.post(
        "/meter/manual",
        json={"reading_m3": 1023.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["first_reading"] is False
    assert data["usage_m3"] == 23.0
    assert data["bill"] is not None


def test_manual_reject_decreasing_does_not_save_reading(client, session):
    """이전값보다 작은 검침값은 거절하고 DB에 저장하지 않는다."""
    first = client.post(
        "/meter/manual",
        json={"reading_m3": 1000.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )
    assert first.status_code == 200

    resp = client.post(
        "/meter/manual",
        json={"reading_m3": 900.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )

    assert resp.status_code == 422
    readings = session.exec(
        select(Reading).where(Reading.device_id == HEADERS_A["X-Device-ID"])
    ).all()
    assert len(readings) == 1


def test_manual_reject_equal_does_not_save_reading(client, session):
    """이전값과 같은 검침값도 거절하고 DB에 저장하지 않는다."""
    first = client.post(
        "/meter/manual",
        json={"reading_m3": 1000.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )
    assert first.status_code == 200

    resp = client.post(
        "/meter/manual",
        json={"reading_m3": 1000.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )

    assert resp.status_code == 422
    assert resp.json()["detail"] == (
        "당월 검침값(1000.0)이 전월(1000.0)보다 작거나 같습니다. 검침값을 확인하세요."
    )
    readings = session.exec(
        select(Reading).where(Reading.device_id == HEADERS_A["X-Device-ID"])
    ).all()
    assert len(readings) == 1


def test_manual_missing_header(client):
    """X-Device-ID 헤더 없으면 400."""
    resp = client.post("/meter/manual", json={"reading_m3": 1000.0, "input_mode": "manual"})
    assert resp.status_code == 400


def test_manual_device_isolation(client):
    """두 기기의 검침 기록이 서로 섞이지 않는다."""
    client.put("/settings", json={"region": "seoul"}, headers=HEADERS_A)
    client.put("/settings", json={"region": "seoul"}, headers=HEADERS_B)

    # A: 1000 → 1010 (10㎥)
    client.post("/meter/manual", json={"reading_m3": 1000.0, "input_mode": "manual"}, headers=HEADERS_A)
    resp_a = client.post("/meter/manual", json={"reading_m3": 1010.0, "input_mode": "manual"}, headers=HEADERS_A)

    # B: 500 → 520 (20㎥)
    client.post("/meter/manual", json={"reading_m3": 500.0, "input_mode": "manual"}, headers=HEADERS_B)
    resp_b = client.post("/meter/manual", json={"reading_m3": 520.0, "input_mode": "manual"}, headers=HEADERS_B)

    assert resp_a.json()["usage_m3"] == 10.0
    assert resp_b.json()["usage_m3"] == 20.0


def test_manual_concurrent_requests_are_serialized(tmp_path, monkeypatch):
    """같은 기기의 동시 요청은 최신 검침값 조회부터 저장까지 직렬화한다."""
    from src.api.main import app
    from src.api.routers import meter

    engine = create_engine(
        f"sqlite:///{tmp_path / 'concurrent.db'}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    original_engine = _db._engine
    _db._engine = engine

    high_in_calc = Event()
    low_transaction_started = Event()
    statement_counts = {"begin": 0, "reading_select": 0}
    statement_counts_lock = Lock()
    original_calc = meter.calc

    @event.listens_for(engine, "before_cursor_execute")
    def signal_low_transaction(_conn, _cursor, statement, _parameters, _context, _executemany):
        normalized = statement.lstrip().upper()
        with statement_counts_lock:
            if normalized.startswith("BEGIN IMMEDIATE"):
                statement_counts["begin"] += 1
                if statement_counts["begin"] == 3:
                    low_transaction_started.set()

    @event.listens_for(engine, "after_cursor_execute")
    def signal_low_read(_conn, _cursor, statement, _parameters, _context, _executemany):
        normalized = statement.lstrip().upper()
        with statement_counts_lock:
            if normalized.startswith("SELECT") and "ORDER BY READING.RECORDED_AT DESC" in normalized:
                statement_counts["reading_select"] += 1
                if statement_counts["reading_select"] == 3:
                    low_transaction_started.set()

    def synchronized_calc(region, prev_reading, curr_reading):
        if curr_reading == 1100.0:
            high_in_calc.set()
            assert low_transaction_started.wait(timeout=10)
        return original_calc(region, prev_reading, curr_reading)

    monkeypatch.setattr(meter, "calc", synchronized_calc)

    try:
        with TestClient(app) as test_client:
            first = test_client.post(
                "/meter/manual",
                json={"reading_m3": 1000.0, "input_mode": "manual"},
                headers=HEADERS_A,
            )
            assert first.status_code == 200

            with ThreadPoolExecutor(max_workers=2) as executor:
                high = executor.submit(
                    test_client.post,
                    "/meter/manual",
                    json={"reading_m3": 1100.0, "input_mode": "manual"},
                    headers=HEADERS_A,
                )
                assert high_in_calc.wait(timeout=10)
                low = executor.submit(
                    test_client.post,
                    "/meter/manual",
                    json={"reading_m3": 1050.0, "input_mode": "manual"},
                    headers=HEADERS_A,
                )
                statuses = [high.result(timeout=10).status_code, low.result(timeout=10).status_code]

        assert statuses == [200, 422]
        with Session(engine) as session:
            saved_values = sorted(
                session.exec(
                    select(Reading).where(Reading.device_id == HEADERS_A["X-Device-ID"])
                ).all(),
                key=lambda row: row.reading_m3,
            )
        assert [row.reading_m3 for row in saved_values] == [1000.0, 1100.0]
    finally:
        _db._engine = original_engine
        engine.dispose()
