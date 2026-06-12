# YOLOX 추론에 공통으로 필요한 유틸리티 함수 모음
#
# detector.py와 digit_detector.py가 공유한다.
# 레터박스 전처리, NMS가 여기에 있다.

import cv2
import numpy as np
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()  # HEIC 포맷 지원 등록

INPUT_SIZE = (640, 640)


def load_image_bgr(img_path: str) -> np.ndarray:
    """HEIC 포함 모든 포맷을 BGR numpy 배열로 읽는다.

    EXIF 방향 보정(exif_transpose)도 적용해 회전 문제를 방지한다.
    """
    pil = ImageOps.exif_transpose(Image.open(img_path)).convert("RGB")
    return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)


def letterbox(img: np.ndarray, input_size=INPUT_SIZE) -> tuple[np.ndarray, float]:
    """BGR 이미지를 레터박스 리사이즈해 YOLOX 입력 형태로 변환한다.

    Returns:
        (tensor, ratio)
            tensor: (1, 3, H, W) float32 배열
            ratio: 원본 → 리사이즈 비율 (좌표 역보정에 사용)
    """
    h, w = img.shape[:2]
    ratio = min(input_size[0] / h, input_size[1] / w)
    nh, nw = int(h * ratio), int(w * ratio)
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    padded = np.full((*input_size, 3), 114, dtype=np.uint8)
    padded[:nh, :nw] = resized
    tensor = padded.transpose(2, 0, 1)[None].astype(np.float32)
    return tensor, ratio


def nms(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float) -> list[int]:
    """IoU 기반 Non-Maximum Suppression → 살아남은 인덱스 반환."""
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        inter_x1 = np.maximum(x1[i], x1[order[1:]])
        inter_y1 = np.maximum(y1[i], y1[order[1:]])
        inter_x2 = np.minimum(x2[i], x2[order[1:]])
        inter_y2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, inter_x2 - inter_x1) * np.maximum(0, inter_y2 - inter_y1)
        iou = inter / (areas[i] + areas[order[1:]] - inter)
        order = order[1:][iou <= iou_threshold]
    return keep
