# smart-water-meter-kr

계량기 사진 한 장에서 검침값을 자동으로 읽는 파이프라인.

## 실행 방법

### 1. 패키지 설치

```bash
uv sync
```

### 2. 추론 실행

```bash
uv run python -m src.model.pipeline <이미지 경로>
```

예시:
```bash
uv run python -m src.model.pipeline meter.jpg
```

출력:
```
12345  (신뢰도: 0.91)
```

## 구조

```
src/
├── model/          # 추론 모델
│   ├── detector.py         # 모델1: 계량기 영역 검출
│   ├── digit_detector.py   # 모델2: 숫자 0~9 검출
│   ├── pipeline.py         # 전체 파이프라인
│   └── yolox_utils.py      # 공유 유틸리티
└── api/            # FastAPI 서버 (구현 예정)
```

> 모델 가중치는 첫 실행 시 자동으로 다운로드됩니다.
