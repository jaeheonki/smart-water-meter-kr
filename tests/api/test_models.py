# DB 모델(Reading, Settings) 삽입/조회 테스트
from datetime import datetime, timezone
from sqlmodel import Session, select, create_engine
from src.api.models import Reading, Settings
from src.api.db import create_db_and_tables


def make_engine():
    engine = create_engine("sqlite:///:memory:")
    create_db_and_tables(engine)
    return engine


def test_reading_insert_and_query():
    engine = make_engine()
    with Session(engine) as session:
        r = Reading(
            device_id="device-abc",
            reading_m3=1043.0,
            confidence=0.91,
            input_mode="auto",
            recorded_at=datetime.now(timezone.utc),
        )
        session.add(r)
        session.commit()
        session.refresh(r)

    with Session(engine) as session:
        results = session.exec(select(Reading).where(Reading.device_id == "device-abc")).all()
        assert len(results) == 1
        assert results[0].reading_m3 == 1043.0
        assert results[0].input_mode == "auto"


def test_settings_upsert():
    engine = make_engine()
    with Session(engine) as session:
        s = Settings(device_id="device-abc", region="seoul")
        session.merge(s)
        session.commit()

    with Session(engine) as session:
        s = session.get(Settings, "device-abc")
        assert s is not None
        assert s.region == "seoul"


def test_readings_isolated_by_device():
    engine = make_engine()
    with Session(engine) as session:
        session.add(Reading(device_id="device-A", reading_m3=1000.0, input_mode="manual", recorded_at=datetime.now(timezone.utc)))
        session.add(Reading(device_id="device-B", reading_m3=2000.0, input_mode="manual", recorded_at=datetime.now(timezone.utc)))
        session.commit()

    with Session(engine) as session:
        results = session.exec(select(Reading).where(Reading.device_id == "device-A")).all()
        assert len(results) == 1
        assert results[0].reading_m3 == 1000.0
