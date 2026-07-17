# API 요청/응답 스키마 및 calc() 결과 변환
#
# 역할: FastAPI 엔드포인트의 입력(Request)과 출력(Response) 형태를 Pydantic으로 정의한다.
#       또한 src.calculation.calc()가 반환하는 한국어 키 dict를
#       API 응답용 영어 키로 변환하는 map_calc_result()를 제공한다.
#
# calc() 반환 구조 (한국어 키):
#   {"사용량_㎥": 23.0, "요금": {"상수도": ..., "합계": ...}, "영향": {"상하수도_전력_kWh": ..., "총CO2_kg": ...}, "전월_검침_㎥": 1020.0}

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ScanResponse(BaseModel):
    """POST /meter/scan 응답.

    YOLO가 사진에서 읽은 검침값을 앱에 돌려준다. 아직 DB에 저장하지 않는다.
    앱은 이 값을 보여주고 사용자가 확인하면 /meter/manual을 호출한다.
    """
    success: bool                           # 인식 성공 여부
    reading_m3: Optional[float] = None      # 인식된 검침값 (실패 시 null)
    confidence: Optional[float] = None      # YOLO 평균 신뢰도 0~1 (실패 시 null)


class ManualRequest(BaseModel):
    """POST /meter/manual 요청.

    스캔 확정이든 수동 입력이든 이 스키마 하나로 처리한다.
    - 스캔 확정: reading_m3 = YOLO 결과, confidence = YOLO 신뢰도, input_mode = "auto"
    - 수동 입력: reading_m3 = 사용자 입력값, confidence = null, input_mode = "manual"
    """
    reading_m3: float                       # 확정된 검침값 (㎥)
    confidence: Optional[float] = None      # 스캔 신뢰도 (수동 입력 시 생략)
    input_mode: str = "manual"              # "auto" | "manual"
    reset_baseline: bool = False            # 계량기 교체 후 새 계산 기준점 여부


class BillSchema(BaseModel):
    """요금 세부 내역."""
    water: int          # 상수도 요금 (원)
    sewage: int         # 하수도 요금 (원)
    water_use_fee: int  # 물이용부담금 (원)
    vat: int            # 부가세 (원)
    total: int          # 합계 (원)


class ImpactSchema(BaseModel):
    """환경 영향 수치."""
    energy_kwh: float   # 상하수도 처리에 쓰인 전력 (kWh)
    co2_kg: float       # 전력 기반 CO2 배출량 (kg)


class ManualResponse(BaseModel):
    """POST /meter/manual 응답.

    첫 검침(이전 기록 없음)이면 first_reading=True, 계산 필드는 모두 null.
    두 번째 검침부터 사용량·요금·환경 영향이 채워진다.
    """
    reading_m3: float                           # 저장된 검침값 (㎥)
    recorded_at: datetime                        # 저장 시각 (UTC)
    first_reading: bool                          # True이면 아래 필드 모두 null
    baseline_reset: bool = False                 # 계량기 교체 기준점으로 저장했는지 여부
    updated: bool = False                        # 오늘 기록을 새 행 없이 수정했는지 여부
    usage_m3: Optional[float] = None             # 이번 달 사용량 (현재 - 이전)
    prev_reading_m3: Optional[float] = None      # 직전 검침값
    bill: Optional[BillSchema] = None            # 요금 세부 내역
    impact: Optional[ImpactSchema] = None        # 환경 영향


class TodayReadingResponse(BaseModel):
    """GET /meter/today 응답."""

    reading_m3: float
    confidence: Optional[float] = None
    input_mode: str
    recorded_at: datetime
    is_baseline: bool = False


class HistoryItem(BaseModel):
    """GET /history 응답의 구간 한 줄."""
    start_label: str    # 시작 월 라벨 (예: "2026-05")
    end_label: str      # 종료 월 라벨 (예: "2026-06")
    usage_m3: float     # 해당 구간 사용량 (㎥)
    bill_total: int     # 해당 구간 요금 합계 (원)
    co2_kg: float       # 해당 구간 CO2 배출량 (kg)


class ReplacementHistoryItem(BaseModel):
    """GET /history/replacements 응답의 교체 이력 한 줄."""
    replaced_at: datetime
    previous_reading_m3: Optional[float] = None
    baseline_reading_m3: float
    input_mode: str


class SettingsResponse(BaseModel):
    """GET /settings 응답 및 PUT /settings 요청·응답."""
    region: Optional[str] = None    # 지역 코드 (예: "seoul"). 미설정이면 null


def map_calc_result(calc_result: dict) -> dict:
    """calc() 반환값의 한국어 키를 API 응답용 영어 키로 변환한다.

    calc()는 src.calculation 내부 구조에 맞는 한국어 키를 사용한다.
    API 응답은 앱팀과 약속한 영어 키를 사용해야 하므로 이 함수가 중간 변환을 담당한다.

    Returns:
        ManualResponse(**result)에 바로 언패킹할 수 있는 dict
    """
    fee = calc_result["요금"]
    imp = calc_result["영향"]
    return {
        "usage_m3": calc_result["사용량_㎥"],
        "prev_reading_m3": calc_result.get("전월_검침_㎥"),
        "bill": BillSchema(
            water=fee["상수도"],
            sewage=fee["하수도"],
            water_use_fee=fee["물이용부담금"],
            vat=fee["부가세"],
            total=fee["합계"],
        ),
        "impact": ImpactSchema(
            energy_kwh=imp["상하수도_전력_kWh"],
            co2_kg=imp["총CO2_kg"],
        ),
    }
