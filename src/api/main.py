# FastAPI 앱 진입점
#
# 역할: FastAPI 앱 인스턴스를 생성하고 모든 라우터를 등록한다.
#       lifespan에서 서버 시작 시 DB 테이블을 초기화한다.
#
# 실행:
#   uv run uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
#   → http://localhost:8000/docs 에서 Swagger UI 확인 가능

from contextlib import asynccontextmanager
from fastapi import FastAPI
from src.api.db import create_db_and_tables
from src.api.routers import history, meter, regions, settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """서버 시작 시 DB 테이블 생성, 종료 시 정리."""
    create_db_and_tables()  # 테이블이 이미 있으면 무시
    yield


app = FastAPI(title="Smart Meter API", lifespan=lifespan)

# 라우터 등록 — 태스크마다 추가됨
app.include_router(regions.router)
app.include_router(settings.router)
app.include_router(meter.router)
app.include_router(history.router)
