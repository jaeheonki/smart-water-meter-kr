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
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select

from src.api.db import get_session
from src.api.models import Reading, Settings
from src.api.routers.settings import _get_device_id
from src.api.schemas import ManualRequest, ManualResponse, ScanResponse, map_calc_result
from src.calculation import calc
from src.model import pipeline

router = APIRouter()


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
    now = datetime.now(timezone.utc).replace(tzinfo=None)  # SQLite는 naive datetime 저장
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
