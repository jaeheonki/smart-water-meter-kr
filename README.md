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

## 요금 계산

검출된 검침값으로 사용량·요금·에너지/CO2를 계산한다. 전국 17개 지역(가정용) 요금표 포함.

```python
from src.calculation import calc

calc("seoul", 1020, 1043)   # 전월 1020㎥, 당월 1043㎥
# -> {'사용량_㎥': 23.0, '요금': {'합계': 29370, ...}, '영향': {'총CO2_kg': 6.57, ...}}
```

당월 − 전월(빼기)은 모듈이 처리하므로 서버는 지역 코드와 검침값만 넘기면 된다.
월별/기간별은 `calc_history(region, [...])`, 지역 목록은 `available_regions()`.

자체 검증:
```bash
python -m src.calculation.core
```

## 구조

```
src/
├── model/          # 추론 모델
│   ├── detector.py         # 모델1: 계량기 영역 검출
│   ├── digit_detector.py   # 모델2: 숫자 0~9 검출
│   ├── pipeline.py         # 전체 파이프라인
│   └── yolox_utils.py      # 공유 유틸리티
├── calculation/    # 요금 계산
│   ├── core.py             # 통합 진입점 (calc / calc_history)
│   ├── engine.py           # 지역 요금표 + 누진 요금 공식
│   ├── impact.py           # 에너지/CO2 환산
│   └── rates/              # 17개 지역 요금표(JSON)
└── api/            # FastAPI 서버 (구현 예정)
```

> 모델 가중치는 첫 실행 시 자동으로 다운로드됩니다.
