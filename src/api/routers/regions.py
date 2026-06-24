# GET /regions — 지원 지역 코드 목록 반환
#
# 역할: src.calculation.available_regions()를 호출해
#       요금표가 준비된 17개 지역 코드 목록을 앱에 전달한다.
#       앱은 이 목록으로 지역 선택 UI를 구성한다.

from fastapi import APIRouter
from src.calculation import available_regions

router = APIRouter()


@router.get("/regions")
def get_regions():
    """지원 지역 코드 목록을 반환한다.

    Returns:
        {"regions": ["busan", "daegu", ..., "seoul"]} — 알파벳 정렬
    """
    return {"regions": available_regions()}
