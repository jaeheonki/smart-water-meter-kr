# -*- coding: utf-8 -*-
"""방울이 수도요금 계산 패키지.

검출된 계량기 검침값 → 사용량 → 요금 + 에너지/CO2 를 계산한다.

서버(FastAPI)에서의 사용:

    from src.calculation import calc, available_regions

    calc("seoul", 1020, 1043)        # 전월·당월 검침값 → 전체 결과
    calc_history("seoul", [...])     # 검침값 여러 개 → 월별/기간별 구간 리스트
    available_regions()              # 요금표가 있는 지역 코드 목록(17개)

세부 함수가 필요하면 src.calculation.engine / src.calculation.impact 직접 import.
"""
from .core import calc, calc_usage, calc_history, available_regions

__all__ = ["calc", "calc_usage", "calc_history", "available_regions"]
