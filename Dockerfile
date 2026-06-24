FROM python:3.12-slim

# OpenCV headless 런타임 의존성 + OpenMP(YOLO 병렬 처리)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# uv 패키지 매니저
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# 의존성 파일을 소스보다 먼저 복사 → 코드 변경 시 패키지 레이어 캐시 재사용
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev && \
    uv pip install onnxruntime  # onnxruntime-gpu → CPU-only 교체 (t2.micro는 GPU 없음)

# 소스 코드
COPY src/ src/

# YOLO 가중치 디렉토리 (첫 요청 시 gdown이 자동 다운로드)
# SQLite 데이터 디렉토리
RUN mkdir -p weights data

EXPOSE 8000

# 데이터 영속화: docker run 시 아래 두 디렉토리를 볼륨으로 마운트
#   -v ./weights:/app/weights   (모델 가중치 — 재다운로드 방지)
#   -v ./data:/app/data         (SQLite DB — 재시작 후에도 데이터 유지)
CMD ["uv", "run", "uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
