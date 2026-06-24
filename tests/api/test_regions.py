# GET /regions 테스트
def test_get_regions(client):
    resp = client.get("/regions")
    assert resp.status_code == 200
    data = resp.json()
    assert "regions" in data
    assert "seoul" in data["regions"]
    assert "busan" in data["regions"]
    assert len(data["regions"]) >= 17
