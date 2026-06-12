# YOLOX 계량기 영역 검출 → crop → YOLOX 숫자 검출 파이프라인
#
# 역할: detector와 digit_detector 두 모듈을 연결해 이미지 한 장에서 검침값을 끝까지 읽는다.
# 흐름: 이미지 경로 입력
#       → detector.detect()        : 계량기 숫자 영역 bounding box 검출 (모델1)
#       → crop + margin            : bounding box로 이미지 잘라내기
#       → 4방향 회전 시도           : 계량기가 기울어진 경우를 대비해 0/90/180/270° 시도
#       → digit_detector.detect_digits() : 숫자 0~9 검출 (모델2)
#       → 방향 점수 비교 → 최적 방향 선택
#       → x좌표 정렬 → 검침값 문자열 조합
#       → [(검침값, 평균신뢰도)] 반환
#
# CLI 사용법:
#   uv run python -m src.model.pipeline <이미지 경로>

import sys
import cv2
import numpy as np

from .detector import detect
from .digit_detector import detect_digits

# 시도할 회전 방향 — 계량기가 기울어진 경우 대비
_ROTATIONS = {
    0:   None,
    90:  cv2.ROTATE_90_CLOCKWISE,
    180: cv2.ROTATE_180,
    270: cv2.ROTATE_90_COUNTERCLOCKWISE,
}


def _score(dets: list) -> float:
    """검출 결과의 방향 점수를 계산한다.

    신뢰도 평균이 높을수록, 숫자들이 한 줄에 가지런할수록, 검출 수가 많을수록 높다.
    """
    if not dets:
        return -1e9
    scores = np.array([d[2] for d in dets])
    cy = np.array([(d[0][1] + d[0][3]) / 2 for d in dets])
    h  = np.array([d[0][3] - d[0][1] for d in dets])
    row_spread = cy.std() / (h.mean() + 1e-6)  # 작을수록 한 줄 정렬
    return float(scores.mean() - 0.5 * row_spread + min(len(dets), 6) * 0.02)


def run(img_path: str, margin: int = 8) -> list[tuple[str, float]]:
    """이미지 한 장에서 계량기 검침값을 읽어 반환한다.

    Args:
        img_path: 입력 이미지 경로 (jpg, png 등 OpenCV가 지원하는 포맷)
        margin: 계량기 bbox 주변에 추가할 여백 픽셀

    Returns:
        [(reading, confidence)] — 검침값 문자열과 평균 신뢰도
        검출 실패 시 빈 리스트 반환

    Example:
        >>> results = run("meter.jpg")
        >>> print(results)  # [("12345", 0.91)]
    """
    # 1단계: 모델1로 계량기 영역 검출
    img, dets = detect(img_path)
    if not dets:
        return []

    # 2단계: bbox + margin으로 crop
    H, W = img.shape[:2]
    (x1, y1, x2, y2), _ = dets[0]
    cx1 = max(0, int(x1) - margin)
    cy1 = max(0, int(y1) - margin)
    cx2 = min(W, int(x2) + margin)
    cy2 = min(H, int(y2) + margin)
    crop = img[cy1:cy2, cx1:cx2]
    if crop.size == 0:
        return []

    # 3단계: 4방향 회전 시도 → 가장 점수 높은 방향 선택
    best_score, best_dets, best_reading = -1e9, [], ""
    for _angle, rot_code in _ROTATIONS.items():
        rotated = crop if rot_code is None else cv2.rotate(crop, rot_code)
        digit_dets = detect_digits(rotated)
        s = _score(digit_dets)
        if s > best_score:
            best_score = s
            best_dets = digit_dets
            # x좌표(왼→오) 정렬 후 숫자 문자열 조합
            sorted_dets = sorted(digit_dets, key=lambda d: d[0][0])
            best_reading = "".join(str(d[1]) for d in sorted_dets)

    if not best_dets:
        return []

    avg_conf = float(np.mean([d[2] for d in best_dets]))
    return [(best_reading, avg_conf)]


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: uv run python src/pipeline.py <이미지 경로>")
        sys.exit(1)

    results = run(sys.argv[1])

    if results:
        for text, conf in results:
            print(f"{text}  (신뢰도: {conf:.2f})")
    else:
        print("검출 또는 숫자 인식 결과 없음")
