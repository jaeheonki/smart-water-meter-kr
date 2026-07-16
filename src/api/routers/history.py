# GET /history — 기기의 전체 검침 이력을 구간별로 계산해 반환 (최신 구간이 먼저)
# GET /history/period — 특정 YYYY-MM-DD 범위의 구간만 필터링해 반환
#
# 흐름:
#   Reading 목록(시간 오름차순) → calc_history(region, [(label, value), ...])
#   → [{"시작_라벨", "끝_라벨", "사용량_㎥", "요금", "영향"}, ...]
#   → HistoryItem 변환 → 최신순 정렬 → 필요 시 기간 필터

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from src.api.db import get_session
from src.api.models import Reading, Settings
from src.api.routers.settings import _get_device_id
from src.api.schemas import HistoryItem
from src.calculation import calc_history

router = APIRouter()


def _compute(session: Session, device_id: str) -> list[HistoryItem]:
    """DB에서 Reading을 불러와 calc_history()로 구간 계산 후 HistoryItem 리스트로 반환.

    검침이 2개 미만이거나 지역 미설정이면 빈 리스트 반환.
    """
    readings = session.exec(
        select(Reading)
        .where(Reading.device_id == device_id)
        .order_by(Reading.recorded_at.asc())
    ).all()

    settings_row = session.get(Settings, device_id)
    region = (settings_row.region if settings_row else None) or "seoul"

    if len(readings) < 2:
        return []

    periods = []
    for prev, current in zip(readings, readings[1:]):
        if current.is_baseline:
            continue
        labeled = [
            (prev.recorded_at.strftime("%Y-%m-%d"), prev.reading_m3),
            (current.recorded_at.strftime("%Y-%m-%d"), current.reading_m3),
        ]
        periods.extend(calc_history(region, labeled))

    items = [
        HistoryItem(
            start_label=p["시작_라벨"],
            end_label=p["끝_라벨"],
            usage_m3=p["사용량_㎥"],
            bill_total=p["요금"]["합계"],
            co2_kg=p["영향"]["총CO2_kg"],
        )
        for p in reversed(periods)  # 최신 구간이 먼저
    ]
    return items


@router.get("/history/period", response_model=list[HistoryItem])
def get_history_period(
    start: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    device_id: str = Depends(_get_device_id),
    session: Session = Depends(get_session),
):
    """start~end(YYYY-MM-DD) 범위 내에 완전히 속하는 구간만 반환한다."""
    items = _compute(session, device_id)
    return [i for i in items if start <= i.start_label and i.end_label <= end]


@router.get("/history", response_model=list[HistoryItem])
def get_history(
    device_id: str = Depends(_get_device_id),
    session: Session = Depends(get_session),
):
    """기기의 전체 검침 이력을 구간별로 계산해 최신 구간이 먼저 오도록 반환한다."""
    return _compute(session, device_id)
