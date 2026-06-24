# POST /meter/scan, POST /meter/manual 테스트
#
# scan: pipeline.run()을 monkeypatch로 대체 — YOLO 모델 없이 결과만 검증
# manual: 실제 calc() 호출 (계산 모듈 테스트 겸용)

import io


HEADERS_A = {"X-Device-ID": "device-A"}
HEADERS_B = {"X-Device-ID": "device-B"}


def _img():
    """업로드용 가짜 이미지 파일 — 테스트마다 새 BytesIO 생성."""
    return ("meter.jpg", io.BytesIO(b"fake-image"), "image/jpeg")


# ────────────────────────────────────────────────────────────────────────────
# /meter/scan
# ────────────────────────────────────────────────────────────────────────────

def test_scan_success(client, monkeypatch):
    """pipeline.run이 결과를 반환하면 success=True와 검침값을 응답한다."""
    monkeypatch.setattr("src.model.pipeline.run", lambda path, **kw: [("12345", 0.91)])
    resp = client.post("/meter/scan", files={"image": _img()})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["reading_m3"] == 12345.0
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


def test_manual_no_region_no_calc(client):
    """지역 미설정이면 두 번째 검침도 first_reading=True (계산 불가)."""
    client.post("/meter/manual", json={"reading_m3": 1000.0, "input_mode": "manual"}, headers=HEADERS_A)
    resp = client.post(
        "/meter/manual",
        json={"reading_m3": 1023.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )
    assert resp.status_code == 200
    assert resp.json()["first_reading"] is True


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
