# -*- coding: utf-8 -*-
"""
방울이 상하수도 요금 계산 엔진.

지역별 요금표(rates/*.json)를 읽어 사용량 → 요금(원)을 계산한다.
공식 뼈대는 전국 공통이고, 지역마다 바뀌는 건 요금표 데이터뿐이다.

사용:
    from engine import load, calc
    표 = load("rates/seoul.json")
    calc(표, "가정용", "13mm", 20)
    # -> {'상수도': ..., '하수도': ..., '물이용부담금': ..., '부가세': ..., '합계': ...}
"""
import json
import sys
from pathlib import Path


_용도_별칭 = {
    "home": "가정용",
    "household": "가정용",
    "domestic": "가정용",
    "residential": "가정용",
    "general": "일반용",
    "business": "일반용",
    "bath": "욕탕용",
    "bathhouse": "욕탕용",
}


def normalize_usage_type(용도):
    """CLI/앱에서 쓸 수 있는 영문 별칭을 실제 요금표 용도명으로 바꾼다."""
    if 용도 is None:
        return 용도
    return _용도_별칭.get(str(용도).strip().lower(), 용도)


def _누진합산(사용량, 구간):
    """구간별 누진 합산.

    구간 = [{"상한_㎥": n, "단가_원": p}, ...]  (상한 오름차순, 마지막 상한=None=초과분 전부)
    예) 40㎥, [30@360, 50@550, None@790] -> 30*360 + 10*550 = 16,300
    """
    남은 = 사용량
    직전상한 = 0
    합계 = 0
    for b in 구간:
        상한 = b["상한_㎥"]
        단가 = b["단가_원"]
        구간폭 = 남은 if 상한 is None else min(남은, 상한 - 직전상한)
        if 구간폭 <= 0:
            break
        합계 += 구간폭 * 단가
        남은 -= 구간폭
        if 상한 is None or 남은 <= 0:
            break
        직전상한 = 상한
    return 합계


def available_meters(요금표, 용도="가정용"):
    """해당 용도에서 선택 가능한 계량기 구경 목록을 돌려준다."""
    용도 = normalize_usage_type(용도)
    try:
        return list(요금표["용도별"][용도]["상수도"]["기본요금_원"].keys())
    except KeyError as e:
        raise KeyError(f"'{용도}' 용도 요금표가 없습니다. 가능한 용도: {', '.join(요금표['용도별'].keys())}") from e


def default_meter(요금표, 용도="가정용"):
    """앱 기본값으로 쓸 대표 구경을 고른다.

    지역별 조례가 13mm 또는 15mm부터 시작해 서로 다르므로, 실제 존재하는
    최소 생활용 구경을 우선한다.
    """
    meters = available_meters(요금표, 용도)
    for preferred in ("15mm", "13mm", "20mm"):
        if preferred in meters:
            return preferred
    return meters[0]


def calc(요금표, 용도, 구경, 사용량):
    """한 달 사용량(㎥)에 대한 요금 항목별 금액과 합계를 돌려준다."""
    용도 = normalize_usage_type(용도)
    u = 요금표["용도별"][용도]
    if 구경 in (None, "", "auto", "자동"):
        구경 = default_meter(요금표, 용도)
    elif 구경 not in u["상수도"]["기본요금_원"]:
        가능한_구경 = ", ".join(available_meters(요금표, 용도))
        raise KeyError(f"'{구경}' 구경 기본요금이 없습니다. 가능한 구경: {가능한_구경}")

    상수_기본 = u["상수도"]["기본요금_원"][구경]
    상수_사용 = _누진합산(사용량, u["상수도"]["사용요금_구간"])
    상수도 = 상수_기본 + 상수_사용

    하수도 = _누진합산(사용량, u["하수도"]["사용요금_구간"])  # 상수 사용량 기준

    물이용부담금 = 사용량 * (요금표.get("물이용부담금_단가_원") or 0)  # 미확정(null)이면 0 처리

    부가세 = round((상수도 + 하수도) * 0.1) if 요금표.get("부가세_적용") else 0

    합계 = round(상수도) + round(하수도) + round(물이용부담금) + 부가세
    return {
        "상수도": round(상수도),
        "하수도": round(하수도),
        "물이용부담금": round(물이용부담금),
        "부가세": 부가세,
        "합계": 합계,
    }


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# 자체 검증 (실제 조례값 아님 — 공식이 맞는지 확인하는 테스트용 가짜 요금표)
# ---------------------------------------------------------------------------
_더미표 = {
    "지역": "테스트시", "수계": "한강", "부가세_적용": False, "물이용부담금_단가_원": 170,
    "용도별": {
        "가정용": {
            "상수도": {
                "기본요금_원": {"13mm": 1080, "20mm": 3000},
                "사용요금_구간": [
                    {"상한_㎥": 30, "단가_원": 360},
                    {"상한_㎥": 50, "단가_원": 550},
                    {"상한_㎥": None, "단가_원": 790},
                ],
            },
            "하수도": {
                "사용요금_구간": [
                    {"상한_㎥": 30, "단가_원": 400},
                    {"상한_㎥": None, "단가_원": 900},
                ],
            },
        }
    },
}


def _selftest():
    # 가정용 13mm, 40㎥ 손계산:
    #   상수 기본 1,080 + (30*360 + 10*550)=16,300  -> 17,380
    #   하수      (30*400 + 10*900)=21,000
    #   물이용    40*170 = 6,800
    #   부가세    면세 -> 0
    #   합계      45,180
    got = calc(_더미표, "가정용", "13mm", 40)
    want = {"상수도": 17380, "하수도": 21000, "물이용부담금": 6800, "부가세": 0, "합계": 45180}
    assert got == want, f"누진 계산 오류!\n  got : {got}\n  want: {want}"
    print("[self-test] 통과 ✔  40㎥ →", got)

    # 경계값: 사용량 0 -> 기본요금만
    z = calc(_더미표, "가정용", "13mm", 0)
    assert z["상수도"] == 1080 and z["하수도"] == 0, z
    print("[self-test] 통과 ✔   0㎥ →", z)


if __name__ == "__main__":
    try:  # Windows 콘솔(cp949)에서 한글·기호 출력 깨짐 방지
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) == 1:
        _selftest()
    elif len(sys.argv) == 5:
        _, 경로, 용도, 구경, 사용량 = sys.argv
        결과 = calc(load(경로), 용도, 구경, float(사용량))
        for k, v in 결과.items():
            print(f"  {k:8s}: {v:>10,} 원")
    else:
        print("사용법: python engine.py [rates/지역.json 용도 구경 사용량㎥]")
        print("  구경은 auto/자동 입력 가능")
        print("  인자 없이 실행하면 자체 검증(self-test) 실행")
