# smart-water-meter-kr

계량기 사진 한 장에서 검침값을 자동으로 읽고, 사용량·요금·CO2를 계산하는 FastAPI 서버.

## 구조

```
src/
├── model/          # YOLO 추론 파이프라인
│   ├── detector.py         # 모델1: 계량기 영역 검출
│   ├── digit_detector.py   # 모델2: 숫자 0~9 검출
│   ├── pipeline.py         # 전체 파이프라인
│   └── yolox_utils.py      # 공유 유틸리티
├── calculation/    # 요금 계산 (전국 17개 지역)
│   ├── core.py             # 통합 진입점 (calc / calc_history)
│   ├── engine.py           # 지역 요금표 + 누진 요금 공식
│   ├── impact.py           # 에너지/CO2 환산
│   └── rates/              # 17개 지역 요금표 (JSON)
└── api/            # FastAPI 서버
    ├── main.py             # 앱 진입점
    ├── db.py               # SQLite 연결
    ├── models.py           # DB 테이블 (Reading, Settings)
    ├── schemas.py          # 요청/응답 스키마
    └── routers/            # 엔드포인트
        ├── regions.py      # GET /regions
        ├── settings.py     # GET/PUT /settings
        ├── meter.py        # POST /meter/scan, /meter/manual
        └── history.py      # GET /history, /history/period

tests/
└── api/            # API 테스트 (pytest)

docs/
├── api-guide.md          # 엔드포인트 사용 가이드
├── deployment-guide.md   # EC2 배포 가이드
└── implementation-log.md # 구현 상세 기록
```

> 모델 가중치는 첫 실행 시 자동으로 다운로드됩니다.

---

## 로컬 실행

```bash
# 의존성 설치
uv sync

# 서버 실행
uv run uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
```

Swagger UI: `http://localhost:8000/docs`

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | /regions | 지원 지역 목록 |
| GET | /settings | 기기 지역 설정 조회 |
| PUT | /settings | 기기 지역 설정 변경 |
| POST | /meter/scan | 이미지 → 검침값 인식 (저장 안 함) |
| POST | /meter/manual | 검침값 저장 + 요금 계산 |
| GET | /history | 전체 검침 이력 |
| GET | /history/period | 기간별 검침 이력 |

자세한 사용법: [docs/api-guide.md](docs/api-guide.md)

---

## 테스트

```bash
uv run pytest tests/api/ -v
```

---

## 요금 계산 모듈 단독 사용

```python
from src.calculation import calc

calc("seoul", 1020, 1043)   # 전월 1020㎥, 당월 1043㎥
# -> {'사용량_㎥': 23.0, '요금': {'합계': 29370, ...}, '영향': {'총CO2_kg': 6.57, ...}}
```

---

## 배포

EC2 배포 방법: [docs/deployment-guide.md](docs/deployment-guide.md)
