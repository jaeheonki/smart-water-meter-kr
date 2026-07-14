# GET /health 및 CORS 헤더 테스트
def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_cors_preflight(client):
    """Vite 개발 서버 오리진의 preflight 요청이 허용되는지 확인."""
    resp = client.options(
        "/regions",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "*"
