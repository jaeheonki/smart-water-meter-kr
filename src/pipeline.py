# YOLOX 검출 → crop → OCR 숫자 읽기 파이프라인
#
# 역할: detector와 ocr 두 모듈을 연결해 이미지 하나에서 계기판 숫자를 끝까지 읽는다.
# 흐름: 이미지 경로 입력
#       → detector.detect()  : 계기판 숫자 영역 bounding box 검출
#       → crop               : bounding box로 이미지 잘라내기
#       → ocr.preprocess()   : crop 전처리 (OCR 라이브러리 미정 — 팀원 구현 예정)
#       → ocr.read_digits()  : 숫자 인식   (OCR 라이브러리 미정 — 팀원 구현 예정)
#       → [(숫자, 신뢰도)] 반환
#
# CLI 사용법:
#   uv run python src/pipeline.py <이미지 경로>

import sys
import cv2

from detector import detect
from ocr import preprocess, read_digits


def run(img_path: str) -> list[tuple[str, float]]:
    """이미지 한 장에서 계기판 숫자를 읽어 반환한다.

    Args:
        img_path: 입력 이미지 경로 (jpg, png 등 OpenCV가 지원하는 포맷)

    Returns:
        [(digits_str, confidence), ...] — 인식된 숫자와 신뢰도 목록
        계기판이 검출되지 않거나 숫자를 읽지 못하면 빈 리스트 반환

    Example:
        >>> results = run("meter.jpg")
        >>> print(results)  # [("123.45", 0.97)]
    """
    # 1단계: YOLOX로 계기판 숫자 영역 검출
    img, dets = detect(img_path)

    if not dets:
        # conf threshold(기본 0.3)를 넘는 검출이 없으면 빈 리스트 반환
        # detector.detect()의 conf 인자를 낮추면 더 많이 잡힐 수 있음
        return []

    # 2단계: 검출된 bounding box로 이미지 잘라내기
    # dets[0]: 신뢰도 1위 박스 (계기판은 이미지당 1개 가정)
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)  # OCR 라이브러리 대부분 RGB 입력을 기대함
    (x1, y1, x2, y2), _ = dets[0]
    crop = rgb[int(y1):int(y2), int(x1):int(x2)]

    # 3단계: 전처리 후 OCR
    return read_digits(preprocess(crop))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: uv run python src/pipeline.py <이미지 경로>")
        sys.exit(1)

    results = run(sys.argv[1])

    if results:
        for text, conf in results:
            print(f"{text}  (신뢰도: {conf:.2f})")
    else:
        print("검출 또는 OCR 결과 없음")
