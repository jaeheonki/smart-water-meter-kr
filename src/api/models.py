# SQLite DB 테이블 정의
#
# 역할: 검침 기록(Reading)과 기기별 지역 설정(Settings) 두 테이블을 SQLModel로 정의한다.
# 사용자 구분: 모든 테이블에 device_id 포함 — 앱이 첫 실행 시 생성한 UUID를 X-Device-ID 헤더로 전달,
#             서버는 이 값으로 데이터를 기기별로 완전히 분리한다.

from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel


class Reading(SQLModel, table=True):
    """계량기 검침 기록 한 행.

    - input_mode: "auto" = 사진 스캔 후 확정, "manual" = 숫자 직접 입력
    - confidence: YOLO 모델 신뢰도 (0~1). 수동 입력이면 null
    - recorded_at: 저장 시각 (UTC). /history에서 YYYY-MM 라벨로 변환해 사용
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    device_id: str = Field(index=True)          # 기기 UUID — 검색 빈도 높아 인덱스 추가
    reading_m3: float                            # 계량기 누적 검침값 (㎥)
    confidence: Optional[float] = None           # YOLO 신뢰도 (수동 입력 시 null)
    input_mode: str                              # "auto" | "manual"
    recorded_at: datetime                        # 저장 시각 (UTC)
    is_baseline: bool = False                    # 계량기 교체 후 새 계산 기준점 여부


class Settings(SQLModel, table=True):
    """기기별 지역 설정 (항상 device_id당 1행).

    - device_id가 PK이므로 기기마다 독립적인 지역 설정을 가진다.
    - region: 요금 계산에 쓰는 지역 코드 (예: "seoul"). available_regions()로 유효값 확인.
    - PUT /settings 호출 시 session.merge()로 upsert — 없으면 생성, 있으면 갱신.
    """
    device_id: str = Field(primary_key=True)    # 기기 UUID (앱이 생성한 고정값)
    region: Optional[str] = None                 # 지역 코드. 미설정이면 null
