# POST /meter/scan, POST /meter/manual 테스트
#
# scan: pipeline.run()을 monkeypatch로 대체 — YOLO 모델 없이 결과만 검증
# manual: 실제 calc() 호출 (계산 모듈 테스트 겸용)

import asyncio
import io
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
import src.api.db as _db
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel import select

from src.api.models import Reading
from src.api.routers.meter import post_scan


HEADERS_A = {"X-Device-ID": "device-A"}
HEADERS_B = {"X-Device-ID": "device-B"}


def _img():
    """업로드용 가짜 이미지 파일 — 테스트마다 새 BytesIO 생성."""
    return ("meter.jpg", io.BytesIO(b"fake-image"), "image/jpeg")


def _add_previous_reading(session, device_id, reading_m3):
    """계산 테스트용 직전 날짜 검침을 저장한다."""
    session.add(
        Reading(
            device_id=device_id,
            reading_m3=reading_m3,
            input_mode="manual",
            recorded_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1),
        )
    )
    session.commit()


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


def test_scan_inference_does_not_block_event_loop(monkeypatch):
    """느린 YOLOX 추론 중에도 이벤트 루프가 다른 요청을 처리할 수 있어야 한다."""
    monkeypatch.setattr("src.model.pipeline.run", lambda path: (time.sleep(0.2), [])[1])

    async def exercise():
        upload = UploadFile(filename="meter.jpg", file=io.BytesIO(b"fake-image"))
        started_at = time.perf_counter()
        scan_task = asyncio.create_task(post_scan(upload))
        await asyncio.sleep(0.02)
        responsive_after = time.perf_counter() - started_at
        await scan_task
        return responsive_after

    assert asyncio.run(exercise()) < 0.1


def test_scan_rejects_concurrent_inference(monkeypatch):
    """이미 추론 중이면 두 번째 요청은 모델을 다시 실행하지 않고 즉시 거절한다."""
    started = threading.Event()
    release = threading.Event()
    calls = 0

    def slow_run(path):
        nonlocal calls
        calls += 1
        started.set()
        release.wait(timeout=1)
        return []

    monkeypatch.setattr("src.model.pipeline.run", slow_run)

    async def exercise():
        first = UploadFile(filename="first.jpg", file=io.BytesIO(b"first"))
        second = UploadFile(filename="second.jpg", file=io.BytesIO(b"second"))
        first_task = asyncio.create_task(post_scan(first))
        await asyncio.to_thread(started.wait, 1)
        rejected_at = time.perf_counter()
        try:
            with pytest.raises(HTTPException) as caught:
                await post_scan(second)
            assert caught.value.status_code == 503
            assert time.perf_counter() - rejected_at < 0.1
        finally:
            release.set()
            await first_task

    asyncio.run(exercise())
    assert calls == 1


# ────────────────────────────────────────────────────────────────────────────
# /meter/manual
# ────────────────────────────────────────────────────────────────────────────

def test_manual_first_reading(client):
    """첫 검침이면 first_reading=True, 요금 필드는 null."""
    resp = client.post(
        "/meter/manual",
        json={"reading_m3": 1000.0, "input_mode": "manual", "reset_baseline": True},
        headers=HEADERS_A,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["first_reading"] is True
    assert data["baseline_reset"] is False
    assert data["bill"] is None
    assert data["usage_m3"] is None


def test_manual_with_calc(client, session):
    """지역 설정 후 두 번째 검침부터 요금이 계산된다."""
    client.put("/settings", json={"region": "seoul"}, headers=HEADERS_A)
    _add_previous_reading(session, "device-A", 1000.0)
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


def test_manual_no_region_defaults_to_seoul(client, session):
    """지역 미설정이면 서울 기준으로 요금을 계산한다."""
    _add_previous_reading(session, "device-A", 1000.0)
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
    _add_previous_reading(session, "device-A", 1000.0)

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
    _add_previous_reading(session, "device-A", 1000.0)

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


def test_manual_reset_baseline_saves_decreasing_reading(client, session):
    """확인된 계량기 교체값은 계산 없이 새 기준점으로 저장한다."""
    _add_previous_reading(session, "device-A", 1000.0)

    resp = client.post(
        "/meter/manual",
        json={"reading_m3": 20.0, "input_mode": "manual", "reset_baseline": True},
        headers=HEADERS_A,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["first_reading"] is False
    assert data["baseline_reset"] is True
    assert data["usage_m3"] is None
    assert data["prev_reading_m3"] is None
    assert data["bill"] is None
    assert data["impact"] is None
    readings = session.exec(
        select(Reading)
        .where(Reading.device_id == HEADERS_A["X-Device-ID"])
        .order_by(Reading.recorded_at.asc())
    ).all()
    assert [row.is_baseline for row in readings] == [False, True]


def test_manual_missing_header(client):
    """X-Device-ID 헤더 없으면 400."""
    resp = client.post("/meter/manual", json={"reading_m3": 1000.0, "input_mode": "manual"})
    assert resp.status_code == 400


def test_today_empty_returns_null(client):
    """오늘 저장된 검침이 없으면 null을 반환한다."""
    response = client.get("/meter/today", headers=HEADERS_A)

    assert response.status_code == 200
    assert response.json() is None


def test_manual_rejects_second_reading_on_same_seoul_day(client, session):
    """한국 날짜가 같은 검침은 새 행으로 추가하지 않는다."""
    first = client.post(
        "/meter/manual",
        json={"reading_m3": 1000.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )
    second = client.post(
        "/meter/manual",
        json={"reading_m3": 1001.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["detail"] == "오늘 검침 기록이 이미 있습니다."
    rows = session.exec(select(Reading).where(Reading.device_id == "device-A")).all()
    assert len(rows) == 1


def test_put_today_updates_existing_row_without_adding_row(client, session):
    """오늘 기록 수정은 기존 행을 갱신하고 새 행을 추가하지 않는다."""
    created = client.post(
        "/meter/manual",
        json={"reading_m3": 1000.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )
    original_recorded_at = created.json()["recorded_at"]

    response = client.put(
        "/meter/today",
        json={"reading_m3": 1001.0, "input_mode": "auto", "confidence": 0.91},
        headers=HEADERS_A,
    )

    assert response.status_code == 200
    assert response.json()["updated"] is True
    assert response.json()["recorded_at"] == original_recorded_at
    rows = session.exec(select(Reading).where(Reading.device_id == "device-A")).all()
    assert len(rows) == 1
    assert rows[0].reading_m3 == 1001.0
    assert rows[0].input_mode == "auto"
    assert rows[0].confidence == 0.91


def test_put_today_recalculates_from_previous_day(client, session):
    """오늘 기록 수정 결과는 오늘 행이 아닌 직전 날짜 기록을 기준으로 계산한다."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(
        Reading(
            device_id="device-A",
            reading_m3=1000.0,
            input_mode="manual",
            recorded_at=now - timedelta(days=1),
        )
    )
    session.add(
        Reading(
            device_id="device-A",
            reading_m3=1010.0,
            input_mode="manual",
            recorded_at=now,
        )
    )
    session.commit()

    response = client.put(
        "/meter/today",
        json={"reading_m3": 1020.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )

    assert response.status_code == 200
    assert response.json()["usage_m3"] == 20.0
    assert response.json()["prev_reading_m3"] == 1000.0


def test_put_today_without_record_returns_404(client):
    """수정할 오늘 기록이 없으면 신규 등록하지 않고 404를 반환한다."""
    response = client.put(
        "/meter/today",
        json={"reading_m3": 1000.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )

    assert response.status_code == 404


def test_today_endpoint_returns_saved_reading(client):
    """오늘 기록 조회는 수정 화면을 채울 값을 반환한다."""
    client.post(
        "/meter/manual",
        json={"reading_m3": 234.918, "input_mode": "auto", "confidence": 0.91},
        headers=HEADERS_A,
    )

    response = client.get("/meter/today", headers=HEADERS_A)

    assert response.status_code == 200
    assert response.json()["reading_m3"] == 234.918
    assert response.json()["input_mode"] == "auto"
    assert response.json()["confidence"] == 0.91


def test_manual_device_isolation(client, session):
    """두 기기의 검침 기록이 서로 섞이지 않는다."""
    client.put("/settings", json={"region": "seoul"}, headers=HEADERS_A)
    client.put("/settings", json={"region": "seoul"}, headers=HEADERS_B)

    # A: 1000 → 1010 (10㎥)
    _add_previous_reading(session, "device-A", 1000.0)
    resp_a = client.post("/meter/manual", json={"reading_m3": 1010.0, "input_mode": "manual"}, headers=HEADERS_A)

    # B: 500 → 520 (20㎥)
    _add_previous_reading(session, "device-B", 500.0)
    resp_b = client.post("/meter/manual", json={"reading_m3": 520.0, "input_mode": "manual"}, headers=HEADERS_B)

    assert resp_a.json()["usage_m3"] == 10.0
    assert resp_b.json()["usage_m3"] == 20.0


def test_manual_concurrent_requests_save_only_one_today(tmp_path):
    """같은 기기의 동시 신규 요청 중 한 건만 오늘 기록으로 저장한다."""
    from src.api.main import app

    engine = create_engine(
        f"sqlite:///{tmp_path / 'concurrent.db'}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    original_engine = _db._engine
    _db._engine = engine

    try:
        with TestClient(app) as test_client:
            with ThreadPoolExecutor(max_workers=2) as executor:
                first = executor.submit(
                    test_client.post,
                    "/meter/manual",
                    json={"reading_m3": 1100.0, "input_mode": "manual"},
                    headers=HEADERS_A,
                )
                second = executor.submit(
                    test_client.post,
                    "/meter/manual",
                    json={"reading_m3": 1200.0, "input_mode": "manual"},
                    headers=HEADERS_A,
                )
                responses = [first.result(timeout=10), second.result(timeout=10)]

        assert sorted(response.status_code for response in responses) == [200, 409]
        with Session(engine) as session:
            rows = session.exec(
                select(Reading).where(Reading.device_id == HEADERS_A["X-Device-ID"])
            ).all()
        assert len(rows) == 1
        assert rows[0].reading_m3 in {1100.0, 1200.0}
    finally:
        _db._engine = original_engine
        engine.dispose()
