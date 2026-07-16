# 현재 기기 데이터 전체 삭제 API를 검증하는 테스트
from datetime import datetime

from sqlmodel import select

from src.api.models import Reading, Settings


def _seed(session, device_id):
    session.add(Reading(
        device_id=device_id,
        reading_m3=100.0,
        input_mode="manual",
        recorded_at=datetime(2026, 1, 15),
    ))
    session.add(Settings(device_id=device_id, region="seoul"))
    session.commit()


def test_delete_device_data_removes_only_current_device(client, session):
    _seed(session, "device-A")
    _seed(session, "device-B")

    response = client.delete("/device-data", headers={"X-Device-ID": "device-A"})

    assert response.status_code == 204
    assert session.exec(select(Reading).where(Reading.device_id == "device-A")).all() == []
    assert session.get(Settings, "device-A") is None
    assert client.get("/history", headers={"X-Device-ID": "device-A"}).json() == []
    assert client.get("/settings", headers={"X-Device-ID": "device-A"}).json() == {"region": "seoul"}
    assert session.get(Settings, "device-B") is not None


def test_delete_device_data_is_idempotent(client):
    headers = {"X-Device-ID": "device-A"}
    assert client.delete("/device-data", headers=headers).status_code == 204
    assert client.delete("/device-data", headers=headers).status_code == 204


def test_delete_device_data_requires_device_header(client):
    assert client.delete("/device-data").status_code == 400
