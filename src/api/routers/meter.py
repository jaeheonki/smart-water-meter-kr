# POST /meter/scan — 이미지 촬영 후 검침값 인식 (DB 저장 안 함)
# POST /meter/manual — 확정된 검침값 저장 + 요금 계산
#
# 흐름:
#   scan:   UploadFile → 임시 파일 저장 → pipeline.run(path) → ScanResponse
#   manual: ManualRequest + X-Device-ID → Reading 저장 → calc() → ManualResponse
#
# 기기별 분리: _get_device_id()가 X-Device-ID 헤더를 추출해 device_id로 사용

import os
import tempfile
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select

from src.api.db import get_session
from src.api.models import Reading, Settings
from src.api.routers.settings import _get_device_id
from src.api.schemas import (
    ManualRequest,
    ManualResponse,
    ScanResponse,
    TodayReadingResponse,
    map_calc_result,
)
from src.calculation import calc
from src.model import pipeline

router = APIRouter()
SEOUL = timezone(timedelta(hours=9))


def _seoul_day_bounds(now: Optional[datetime] = None) -> tuple[datetime, datetime]:
    """현재 한국 날짜의 시작과 끝을 SQLite용 UTC naive 시각으로 반환한다."""
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    local_date = current.astimezone(SEOUL).date()
    start_local = datetime.combine(local_date, time.min, tzinfo=SEOUL)
    end_local = start_local + timedelta(days=1)
    return (
        start_local.astimezone(timezone.utc).replace(tzinfo=None),
        end_local.astimezone(timezone.utc).replace(tzinfo=None),
    )


def _get_today_reading(
    session: Session,
    device_id: str,
    now: Optional[datetime] = None,
) -> Optional[Reading]:
    start, end = _seoul_day_bounds(now)
    return session.exec(
        select(Reading)
        .where(
            Reading.device_id == device_id,
            Reading.recorded_at >= start,
            Reading.recorded_at < end,
        )
        .order_by(Reading.recorded_at.desc())
    ).first()


@router.post("/meter/scan", response_model=ScanResponse)
async def post_scan(image: UploadFile = File(...)):
    """이미지를 YOLO 파이프라인으로 분석해 검침값을 반환한다. DB에 저장하지 않는다.

    앱은 이 결과를 사용자에게 보여준 뒤 확정 시 /meter/manual을 호출한다.
    """
    # pipeline.run()은 파일 경로를 받으므로 업로드 이미지를 임시 파일에 저장
    suffix = Path(image.filename or "meter.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await image.read())
        tmp_path = tmp.name

    try:
        results = pipeline.run(tmp_path)
    except Exception:
        return ScanResponse(success=False)
    finally:
        os.unlink(tmp_path)

    if not results:
        return ScanResponse(success=False)

    reading_str, confidence = results[0]
    try:
        reading_m3 = float(reading_str) / 1000
    except (ValueError, TypeError):
        return ScanResponse(success=False)

    return ScanResponse(success=True, reading_m3=reading_m3, confidence=confidence)


@router.post("/meter/manual", response_model=ManualResponse)
def post_manual(
    body: ManualRequest,
    device_id: str = Depends(_get_device_id),
    session: Session = Depends(get_session),
):
    """확정된 검침값을 DB에 저장하고 이전 기록과의 차이로 요금을 계산한다.

    - 첫 검침이거나 지역 미설정이면 first_reading=True, 요금·환경 필드는 null.
    - 두 번째 검침부터 지역이 설정되어 있으면 사용량·요금·CO2 계산 후 반환.
    """
    # 이전 검침 기록 조회 (현재 기기의 가장 최근)
    session.connection().exec_driver_sql("BEGIN IMMEDIATE")
    now_aware = datetime.now(timezone.utc)
    now = now_aware.replace(tzinfo=None)  # SQLite는 naive datetime 저장
    if _get_today_reading(session, device_id, now_aware):
        raise HTTPException(status_code=409, detail="오늘 검침 기록이 이미 있습니다.")
    prev = session.exec(
        select(Reading)
        .where(Reading.device_id == device_id)
        .order_by(Reading.recorded_at.desc())
    ).first()

    # 지역 설정 조회 (미설정이면 기본값 seoul)
    settings_row = session.get(Settings, device_id)
    region = (settings_row.region if settings_row else None) or "seoul"

    # 요금 계산 — 교체 기준점이 아니면서 curr > prev 위반 시 422
    if prev and not body.reset_baseline:
        if body.reading_m3 <= prev.reading_m3:
            detail = (
                f"당월 검침값({body.reading_m3})이 전월({prev.reading_m3})보다 작거나 같습니다. "
                "검침값을 확인하세요."
            )
            raise HTTPException(status_code=422, detail=detail)
        try:
            result = calc(region, prev.reading_m3, body.reading_m3)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

    # 새 검침 저장
    reading = Reading(
        device_id=device_id,
        reading_m3=body.reading_m3,
        confidence=body.confidence,
        input_mode=body.input_mode,
        recorded_at=now,
        is_baseline=bool(prev and body.reset_baseline),
    )
    session.add(reading)
    session.commit()
    session.refresh(reading)

    # 첫 검침이면 계산 없이 반환
    if not prev:
        return ManualResponse(reading_m3=body.reading_m3, recorded_at=now, first_reading=True)

    if body.reset_baseline:
        return ManualResponse(
            reading_m3=body.reading_m3,
            recorded_at=now,
            first_reading=False,
            baseline_reset=True,
        )

    return ManualResponse(
        reading_m3=body.reading_m3,
        recorded_at=now,
        first_reading=False,
        **map_calc_result(result),
    )


@router.get("/meter/today", response_model=Optional[TodayReadingResponse])
def get_today(
    device_id: str = Depends(_get_device_id),
    session: Session = Depends(get_session),
):
    """현재 기기의 한국 날짜 기준 오늘 검침을 반환한다."""
    return _get_today_reading(session, device_id)


@router.put("/meter/today", response_model=ManualResponse)
def put_today(
    body: ManualRequest,
    device_id: str = Depends(_get_device_id),
    session: Session = Depends(get_session),
):
    """한국 날짜 기준 오늘 검침 행을 새 행 추가 없이 수정한다."""
    session.connection().exec_driver_sql("BEGIN IMMEDIATE")
    start, _ = _seoul_day_bounds()
    today = _get_today_reading(session, device_id)
    if not today:
        raise HTTPException(status_code=404, detail="오늘 검침 기록이 없습니다.")

    prev = session.exec(
        select(Reading)
        .where(Reading.device_id == device_id, Reading.recorded_at < start)
        .order_by(Reading.recorded_at.desc())
    ).first()
    settings_row = session.get(Settings, device_id)
    region = (settings_row.region if settings_row else None) or "seoul"

    result = None
    if prev and not body.reset_baseline:
        if body.reading_m3 <= prev.reading_m3:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"이번달 검침값({body.reading_m3})이 이전달({prev.reading_m3})보다 작거나 같습니다. "
                    "검침값을 확인하세요."
                ),
            )
        try:
            result = calc(region, prev.reading_m3, body.reading_m3)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error))

    today.reading_m3 = body.reading_m3
    today.confidence = body.confidence
    today.input_mode = body.input_mode
    today.is_baseline = today.is_baseline or bool(prev and body.reset_baseline)
    session.add(today)
    session.commit()
    session.refresh(today)

    if not prev:
        return ManualResponse(
            reading_m3=today.reading_m3,
            recorded_at=today.recorded_at,
            first_reading=True,
            updated=True,
        )
    if today.is_baseline:
        return ManualResponse(
            reading_m3=today.reading_m3,
            recorded_at=today.recorded_at,
            first_reading=False,
            baseline_reset=True,
            updated=True,
        )
    return ManualResponse(
        reading_m3=today.reading_m3,
        recorded_at=today.recorded_at,
        first_reading=False,
        updated=True,
        **map_calc_result(result),
    )
