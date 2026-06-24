# SQLite DB 엔진 및 세션 의존성
#
# 역할: SQLite 파일(data.db)에 연결하는 엔진을 생성하고,
#       FastAPI 라우터에 DB 세션을 주입하는 get_session()을 제공한다.
#
# 테스트 격리: create_db_and_tables(engine)에 인메모리 엔진을 넘기면
#             실제 파일을 건드리지 않고 테스트용 DB를 독립적으로 사용할 수 있다.

from typing import Generator
from sqlmodel import Session, SQLModel, create_engine

# data/ 디렉토리에 저장 — Docker에서 -v ./data:/app/data 로 마운트해 데이터를 영속화
# check_same_thread=False: FastAPI의 비동기 요청에서 같은 연결을 재사용할 수 있게 함
import os
os.makedirs("data", exist_ok=True)
DATABASE_URL = "sqlite:///./data/data.db"
_engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def create_db_and_tables(engine=None):
    """Reading, Settings 테이블을 생성한다. 이미 존재하면 무시한다.

    Args:
        engine: 테스트에서 인메모리 엔진을 넘길 때 사용. None이면 기본 파일 엔진 사용.
    """
    SQLModel.metadata.create_all(engine or _engine)


def get_session() -> Generator[Session, None, None]:
    """FastAPI Depends()로 라우터에 주입되는 DB 세션 제너레이터.

    요청 하나당 세션 하나를 열고, 요청이 끝나면 자동으로 닫는다.
    테스트에서는 app.dependency_overrides[get_session]으로 인메모리 세션으로 교체한다.
    """
    with Session(_engine) as session:
        yield session
