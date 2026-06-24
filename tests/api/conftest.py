# 테스트 공용 fixture — 인메모리 DB + TestClient
#
# SQLite :memory: DB는 연결마다 별도 DB를 생성하므로, StaticPool을 써서
# 모든 연결이 같은 메모리 DB(= 같은 테이블)를 바라보게 한다.
# db._engine을 교체하면 lifespan의 create_db_and_tables()와
# get_session() 모두 같은 엔진을 사용한다.

import pytest
import src.api.db as _db
import src.api.models  # noqa: F401 — Reading, Settings를 SQLModel metadata에 등록
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import create_engine


@pytest.fixture(name="session")
def session_fixture(client):
    """테스트에서 Reading을 직접 DB에 삽입할 때 사용하는 세션 fixture.
    client fixture가 먼저 실행돼 _db._engine이 인메모리 엔진으로 교체된 상태여야 한다.
    """
    from sqlmodel import Session
    with Session(_db._engine) as s:
        yield s


@pytest.fixture(name="client")
def client_fixture():
    from src.api.main import app

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # 모든 연결이 같은 메모리 DB 공유
    )
    original_engine = _db._engine
    _db._engine = engine

    with TestClient(app) as c:  # lifespan → create_db_and_tables() → 테이블 생성
        yield c

    _db._engine = original_engine
