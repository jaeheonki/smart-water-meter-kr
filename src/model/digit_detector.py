# YOLOX-s ONNX 모델(10클래스)로 crop 이미지에서 숫자 0~9를 검출하는 모듈
#
# 역할: 계량기 영역 crop을 입력받아 각 숫자 위치(bounding box)와 값(0~9)을 반환한다.
# 흐름: crop → 레터박스 전처리 → ONNX 추론 → NMS → [(bbox, digit, score)]
#
# decode_in_inference=True로 export했으므로 모델이 이미 절대 좌표를 출력한다.
# 그리드 디코딩 불필요 — confidence 필터 + argmax + NMS만 수행한다.

import gdown
import numpy as np
from pathlib import Path
import onnxruntime as ort

from .yolox_utils import letterbox, nms as _nms_fn

WEIGHTS_DIR = Path(__file__).parent.parent / "weights"
ONNX_PATH = WEIGHTS_DIR / "digit_yolox_s.onnx"
DATA_PATH = WEIGHTS_DIR / "digit_yolox_s.onnx.data"

ONNX_FILE_ID = "1Ky78Uny1IbEbf-knB_HpO0_mx1t8Ix3V"
DATA_FILE_ID = "1te1d-XQCaYd4g53kUxyCT-QzAPCqOUM2"

_session = None


def _download_weights():
    """Google Drive에서 숫자 검출 ONNX 모델 파일 두 개를 weights/ 폴더에 다운로드한다."""
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    print("숫자 검출 모델 다운로드 중...")
    gdown.download(id=ONNX_FILE_ID, output=str(ONNX_PATH), quiet=False)
    gdown.download(id=DATA_FILE_ID, output=str(DATA_PATH), quiet=False)


def _ensure_loaded():
    """ONNX Runtime 세션이 없으면 초기화한다 (lazy loading)."""
    global _session
    if _session is not None:
        return
    if not ONNX_PATH.exists() or not DATA_PATH.exists():
        _download_weights()
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    _session = ort.InferenceSession(str(ONNX_PATH), providers=providers)
    print(f"숫자 검출 모델 로드 완료 (provider: {_session.get_providers()[0]})")


def _decode(output: np.ndarray, ratio: float, conf: float, nms: float, img_shape: tuple) -> list:
    """YOLOX 10클래스 출력(이미 디코딩된 절대 좌표)에서 숫자 검출 목록을 반환한다.

    출력 shape: (1, 8400, 15) — cx, cy, w, h, objectness, class_conf×10
    Returns:
        [(bbox_xyxy, digit, score), ...]
    """
    pred = output[0].copy()  # (8400, 15)

    class_scores = pred[:, 5:]                      # (8400, 10)
    class_ids = class_scores.argmax(axis=1)          # 클래스 인덱스 = 숫자값 0~9
    scores = pred[:, 4] * class_scores.max(axis=1)

    mask = scores > conf
    if not mask.any():
        return []

    pred, scores, class_ids = pred[mask], scores[mask], class_ids[mask]

    # cx, cy, w, h → x1, y1, x2, y2, 원본 이미지 좌표로 역보정
    boxes = np.stack([
        pred[:, 0] - pred[:, 2] / 2,
        pred[:, 1] - pred[:, 3] / 2,
        pred[:, 0] + pred[:, 2] / 2,
        pred[:, 1] + pred[:, 3] / 2,
    ], axis=1) / ratio

    h, w = img_shape[:2]
    boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, w)
    boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, h)

    keep = _nms_fn(boxes, scores, nms)
    return [(boxes[i], int(class_ids[i]), float(scores[i])) for i in keep]


def detect_digits(crop_bgr: np.ndarray, conf: float = 0.3, nms: float = 0.45) -> list:
    """BGR crop 이미지에서 숫자 0~9를 검출한다.

    Args:
        crop_bgr: BGR 포맷의 crop 이미지
        conf: confidence threshold (기본 0.3)
        nms: NMS IoU threshold (기본 0.45)

    Returns:
        [(bbox_xyxy, digit, score), ...] — x좌표 미정렬, 전체 검출 결과
    """
    _ensure_loaded()
    tensor, ratio = letterbox(crop_bgr)
    input_name = _session.get_inputs()[0].name
    output = _session.run(None, {input_name: tensor})[0]
    return _decode(output, ratio, conf, nms, crop_bgr.shape)
