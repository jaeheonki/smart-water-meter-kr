# GET /settings, PUT /settings 테스트
# 모든 요청에 X-Device-ID 헤더 포함 — 기기별 설정 분리 검증

DEVICE_A = "device-A"
DEVICE_B = "device-B"
HEADERS_A = {"X-Device-ID": DEVICE_A}
HEADERS_B = {"X-Device-ID": DEVICE_B}


def test_get_settings_initial(client):
    # 설정 전이면 기본값 seoul
    resp = client.get("/settings", headers=HEADERS_A)
    assert resp.status_code == 200
    assert resp.json()["region"] == "seoul"


def test_put_settings(client):
    resp = client.put("/settings", json={"region": "seoul"}, headers=HEADERS_A)
    assert resp.status_code == 200
    assert resp.json()["region"] == "seoul"


def test_get_settings_after_put(client):
    client.put("/settings", json={"region": "busan"}, headers=HEADERS_A)
    resp = client.get("/settings", headers=HEADERS_A)
    assert resp.status_code == 200
    assert resp.json()["region"] == "busan"


def test_put_settings_invalid_region(client):
    # 지원하지 않는 지역 코드는 422
    resp = client.put("/settings", json={"region": "invalid_city"}, headers=HEADERS_A)
    assert resp.status_code == 422


def test_settings_isolated_by_device(client):
    # 기기 A, B가 각자 다른 지역을 설정해도 서로 영향 없음
    client.put("/settings", json={"region": "seoul"}, headers=HEADERS_A)
    client.put("/settings", json={"region": "busan"}, headers=HEADERS_B)
    assert client.get("/settings", headers=HEADERS_A).json()["region"] == "seoul"
    assert client.get("/settings", headers=HEADERS_B).json()["region"] == "busan"


def test_get_settings_missing_header(client):
    # X-Device-ID 헤더 없으면 400
    resp = client.get("/settings")
    assert resp.status_code == 400
