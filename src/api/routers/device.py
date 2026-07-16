# 현재 기기의 검침과 설정 데이터를 전체 삭제하는 API 라우터
from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session, select

from src.api.db import get_session
from src.api.models import Reading, Settings
from src.api.routers.settings import _get_device_id

router = APIRouter()


@router.delete("/device-data", status_code=status.HTTP_204_NO_CONTENT)
def delete_device_data(
    device_id: str = Depends(_get_device_id),
    session: Session = Depends(get_session),
):
    readings = session.exec(select(Reading).where(Reading.device_id == device_id)).all()
    for reading in readings:
        session.delete(reading)
    settings_row = session.get(Settings, device_id)
    if settings_row is not None:
        session.delete(settings_row)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
