# 계기판 숫자 영역을 YOLOX-s ONNX 모델로 검출하는 모듈
#
# 역할: 이미지를 입력받아 계기판의 숫자 표시 영역(bounding box)을 찾아 반환한다.
# 흐름: 이미지 읽기 → 레터박스 전처리 → ONNX 추론 → NMS → bounding box 반환
#
# decode_in_inference=True로 export했으므로 모델이 이미 절대 좌표를 출력한다.
# 그리드 디코딩 불필요 — confidence 필터 + NMS만 수행한다.
#
# 의존성:
#   - onnxruntime-gpu (PyTorch 불필요)
#   - 모델 파일: weights/meter_yolox_s.onnx + weights/meter_yolox_s.onnx.data
#     (없으면 Google Drive에서 자동 다운로드)

import gdown
import numpy as np
from pathlib import Path
import onnxruntime as ort

from .yolox_utils import load_image_bgr, letterbox, nms as _nms_fn

WEIGHTS_DIR = Path(__file__).parent.parent / "weights"
ONNX_PATH = WEIGHTS_DIR / "meter_yolox_s.onnx"
DATA_PATH = WEIGHTS_DIR / "meter_yolox_s.onnx.data"

ONNX_FILE_ID = "18i9UnaiA4hSfrgcGuaWyxB2mBt7ND-2L"
DATA_FILE_ID = "1hhRgc6A1Q5rTAJKZuz2LTcI82-5jeg0V"

_session = None


def _download_weights():
    """Google Drive에서 ONNX 모델 파일 두 개를 weights/ 폴더에 다운로드한다."""
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    print("계량기 검출 모델 다운로드 중...")
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
    print(f"계량기 검출 모델 로드 완료 (provider: {_session.get_providers()[0]})")


def _decode(output: np.ndarray, ratio: float, conf: float, nms: float, img_shape: tuple) -> list:
    """YOLOX 출력(이미 디코딩된 절대 좌표)에서 bounding box를 추출한다.

    출력 shape: (1, 8400, 6) — cx, cy, w, h, objectness, class_conf
    """
    pred = output[0].copy()  # (8400, 6)

    scores = pred[:, 4] * pred[:, 5:].max(axis=1)

    mask = scores > conf
    if not mask.any():
        return []

    pred, scores = pred[mask], scores[mask]

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
    # 계기판은 이미지당 1개 → 신뢰도 가장 높은 것만 반환
    return [(boxes[i], float(scores[i])) for i in keep[:1]]


def detect(img_path: str, conf: float = 0.3, nms: float = 0.45) -> tuple[np.ndarray, list]:
    """이미지에서 계기판 숫자 영역을 검출한다.

    Args:
        img_path: 입력 이미지 경로
        conf: confidence threshold (기본 0.3)
        nms: NMS IoU threshold (기본 0.45)

    Returns:
        (img_bgr, dets)
            img_bgr: BGR 원본 이미지
            dets: [(xyxy_array, score)] — 최대 1개
    """
    _ensure_loaded()
    img = load_image_bgr(str(img_path))
    tensor, ratio = letterbox(img)
    input_name = _session.get_inputs()[0].name
    output = _session.run(None, {input_name: tensor})[0]
    return img, _decode(output, ratio, conf, nms, img.shape)
