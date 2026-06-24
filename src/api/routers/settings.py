# GET /settings, PUT /settings — 기기별 지역 설정 조회 및 변경
#
# 역할: X-Device-ID 헤더로 기기를 식별하고, 해당 기기의 지역 설정을 조회하거나 저장한다.
#       지역 코드는 src.calculation.available_regions()로 유효성을 검증한다.
#
# DB 조작:
#   - GET: Settings 테이블에서 device_id로 row 조회. 없으면 region=null 반환
#   - PUT: session.merge()로 upsert — 없으면 생성, 있으면 갱신

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlmodel import Session
from src.api.db import get_session
from src.api.models import Settings
from src.api.schemas import SettingsResponse
from src.calculation import available_regions

router = APIRouter()


def _get_device_id(x_device_id: str = Header(None)) -> str:
    """X-Device-ID 헤더를 추출한다. 없으면 400 반환."""
    if not x_device_id:
        raise HTTPException(status_code=400, detail="X-Device-ID 헤더가 필요합니다.")
    return x_device_id


@router.get("/settings", response_model=SettingsResponse)
def get_settings(
    device_id: str = Depends(_get_device_id),
    session: Session = Depends(get_session),
):
    """현재 기기의 지역 설정을 반환한다. 미설정이면 기본값 seoul."""
    s = session.get(Settings, device_id)
    region = s.region if s else None
    return SettingsResponse(region=region or "seoul")


@router.put("/settings", response_model=SettingsResponse)
def put_settings(
    body: SettingsResponse,
    device_id: str = Depends(_get_device_id),
    session: Session = Depends(get_session),
):
    """기기의 지역 설정을 변경한다. 없으면 생성, 있으면 갱신(upsert).

    Raises:
        422: 지원하지 않는 지역 코드
    """
    if body.region not in available_regions():
        raise HTTPException(status_code=422, detail="지역 코드가 올바르지 않습니다.")
    session.merge(Settings(device_id=device_id, region=body.region))
    session.commit()
    return SettingsResponse(region=body.region)
