# CPU EC2 이미지가 GPU 런타임을 설치하지 않는지 검증하는 테스트
from pathlib import Path


def test_dockerfile_skips_gpu_runtime_before_installing_cpu_runtime():
    dockerfile = Path("Dockerfile").read_text(encoding="utf-8")

    assert "uv sync --no-dev --no-install-package onnxruntime-gpu" in dockerfile
    assert "uv pip install onnxruntime" in dockerfile
