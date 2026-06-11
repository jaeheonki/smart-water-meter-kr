# crop 이미지에서 숫자를 읽는 모듈 (OCR 라이브러리 미정 — 팀원 구현 예정)
#
# pipeline.py에서 아래 두 함수를 호출한다.
#   - preprocess(crop_rgb) : OCR 전 전처리 (확대, 대비 보정 등)
#   - read_digits(crop_rgb): 숫자·소수점 문자열과 신뢰도 반환

import numpy as np


def preprocess(_crop_rgb: np.ndarray) -> np.ndarray:
    """OCR 전 crop 이미지를 전처리한다.

    Args:
        crop_rgb: RGB 포맷의 crop 이미지 (numpy array)

    Returns:
        전처리된 RGB 이미지 (numpy array)
    """
    raise NotImplementedError


def read_digits(crop_rgb: np.ndarray) -> list[tuple[str, float]]:
    """crop 이미지에서 숫자와 소수점만 추출한다.

    Args:
        crop_rgb: RGB 포맷의 crop 이미지 (numpy array)

    Returns:
        [(digits_str, confidence), ...] 예: [("123.45", 0.97)]
        인식 결과 없으면 빈 리스트 반환
    """
    raise NotImplementedError
