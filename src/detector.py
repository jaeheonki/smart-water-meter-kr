# 계기판 숫자 영역을 YOLOX-s ONNX 모델로 검출하는 모듈
#
# 역할: 이미지를 입력받아 계기판의 숫자 표시 영역(bounding box)을 찾아 반환한다.
# 흐름: 이미지 읽기 → 레터박스 전처리 → ONNX 추론 → 디코딩 + NMS → bounding box 반환
#
# 의존성:
#   - onnxruntime-gpu (PyTorch 불필요)
#   - 모델 파일: weights/meter_yolox_s.onnx + weights/meter_yolox_s.onnx.data
#     (없으면 Google Drive에서 자동 다운로드)

import gdown
import cv2
import numpy as np
from pathlib import Path
import onnxruntime as ort

WEIGHTS_DIR = Path(__file__).parent.parent / "weights"
ONNX_PATH = WEIGHTS_DIR / "meter_yolox_s.onnx"
DATA_PATH = WEIGHTS_DIR / "meter_yolox_s.onnx.data"

# Google Drive 파일 ID
ONNX_FILE_ID = "1JKEgzKmyDkkUxyfF3Mqbtctxko9heE92"
DATA_FILE_ID = "15wpdUJBMFDnX0AR1m6NJqvdGVpkBQJ6S"

# YOLOX-s 학습 시 사용한 입력 크기
INPUT_SIZE = (640, 640)

# 디코딩에 필요한 그리드·스트라이드 사전 계산 (모듈 로드 시 1회)
# stride 8/16/32 → 80×80 + 40×40 + 20×20 = 8400 예측
def _make_grids(input_size=INPUT_SIZE, strides=(8, 16, 32)):
    grids, stride_arr = [], []
    for stride in strides:
        h, w = input_size[0] // stride, input_size[1] // stride
        yv, xv = np.meshgrid(np.arange(h), np.arange(w), indexing="ij")
        grids.append(np.stack((xv, yv), axis=-1).reshape(-1, 2))
        stride_arr.append(np.full((h * w, 1), stride, dtype=np.float32))
    return np.concatenate(grids).astype(np.float32), np.concatenate(stride_arr)

_GRIDS, _STRIDES = _make_grids()

# 모듈 레벨 싱글턴 — 세션은 한 번만 생성하고 재사용한다
_session = None


def _download_weights():
    """Google Drive에서 ONNX 모델 파일 두 개를 weights/ 폴더에 다운로드한다."""
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    print("모델 파일 다운로드 중...")
    gdown.download(id=ONNX_FILE_ID, output=str(ONNX_PATH), quiet=False)
    gdown.download(id=DATA_FILE_ID, output=str(DATA_PATH), quiet=False)


def _ensure_loaded():
    """ONNX Runtime 세션이 없으면 초기화한다 (lazy loading)."""
    global _session
    if _session is not None:
        return
    if not ONNX_PATH.exists() or not DATA_PATH.exists():
        _download_weights()
    # GPU 사용 가능하면 CUDAExecutionProvider, 없으면 CPU로 자동 폴백
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    _session = ort.InferenceSession(str(ONNX_PATH), providers=providers)
    print(f"모델 로드 완료 (provider: {_session.get_providers()[0]})")


def _letterbox(img: np.ndarray) -> tuple[np.ndarray, float]:
    """BGR 이미지를 레터박스 리사이즈해 YOLOX 입력 형태로 변환한다.

    Returns:
        (tensor, ratio)
            tensor: (1, 3, H, W) float32 배열
            ratio: 원본 → 리사이즈 비율 (좌표 역보정에 사용)
    """
    h, w = img.shape[:2]
    ratio = min(INPUT_SIZE[0] / h, INPUT_SIZE[1] / w)
    nh, nw = int(h * ratio), int(w * ratio)
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)

    # 빈 영역을 114(YOLOX 기본 패딩값)로 채운다
    padded = np.full((*INPUT_SIZE, 3), 114, dtype=np.uint8)
    padded[:nh, :nw] = resized

    # HWC → CHW → NCHW, float32 (YOLOX는 정규화 없이 그대로 사용)
    tensor = padded.transpose(2, 0, 1)[None].astype(np.float32)
    return tensor, ratio


def _nms(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float) -> list[int]:
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


def _decode(output: np.ndarray, ratio: float, conf: float, nms: float) -> list:
    """YOLOX ONNX 출력(raw)을 디코딩해 bounding box 목록을 반환한다.

    ONNX export 시 decode_in_inference=False 이므로 그리드 기반 디코딩이 필요하다.
    출력 shape: (1, 8400, 5+num_classes) → (1, 8400, 6) for 1 class
    """
    pred = output[0].copy()  # (8400, 6)

    # x, y: 그리드 셀 오프셋 → 절대 좌표 (stride 단위)
    pred[:, :2] = (pred[:, :2] + _GRIDS) * _STRIDES
    # w, h: log 스케일 → 절대 크기
    pred[:, 2:4] = np.exp(pred[:, 2:4]) * _STRIDES

    # 최종 신뢰도 = objectness × class_conf
    scores = pred[:, 4] * pred[:, 5:].max(axis=1)

    mask = scores > conf
    if not mask.any():
        return []

    pred, scores = pred[mask], scores[mask]

    # cx, cy, w, h → x1, y1, x2, y2 변환 후 원본 픽셀 좌표로 역보정
    boxes = np.stack([
        pred[:, 0] - pred[:, 2] / 2,
        pred[:, 1] - pred[:, 3] / 2,
        pred[:, 0] + pred[:, 2] / 2,
        pred[:, 1] + pred[:, 3] / 2,
    ], axis=1) / ratio

    keep = _nms(boxes, scores, nms)
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
    img = cv2.imread(str(img_path))
    tensor, ratio = _letterbox(img)
    input_name = _session.get_inputs()[0].name
    output = _session.run(None, {input_name: tensor})[0]
    return img, _decode(output, ratio, conf, nms)
