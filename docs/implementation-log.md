# FastAPI 서버 구현 로그

설계 문서: `2026-06-24-fastapi-server-design.md`
구현 계획: `2026-06-24-fastapi-server.md`

---

## 전체 파이프라인

```
[ 스마트폰 앱 ]
    │  HTTP 요청 (헤더: X-Device-ID: <기기 UUID>)
    ▼
[ src/api/main.py ]  ← FastAPI 앱. 서버 시작 시 DB 초기화
    │
    ├─ GET  /regions
    │       └─ routers/regions.py
    │               └─ src.calculation.available_regions()
    │                       → 지역 코드 목록 JSON 반환
    │
    ├─ GET  /settings
    ├─ PUT  /settings
    │       └─ routers/settings.py
    │               └─ src/api/db.py (get_session)
    │               └─ src/api/models.py (Settings 테이블)
    │                       → 기기별 지역 코드 조회/저장
    │
    ├─ POST /meter/scan       ← 사진만 인식, DB 저장 안 함
    ├─ POST /meter/manual     ← 검침값 저장 + 요금 계산
    │       └─ routers/meter.py
    │               ├─ (scan)   src.model.pipeline.run(이미지)
    │               │               → YOLO 2단계 추론 → 검침값 + 신뢰도
    │               └─ (manual) src.calculation.calc(region, prev, curr)
    │                           → map_calc_result() (한국어→영어 키 변환)
    │                           → src/api/db.py (Reading 저장)
    │                               → ManualResponse JSON 반환
    │
    ├─ GET  /history
    ├─ GET  /history/period
    │       └─ routers/history.py
    │               └─ src/api/db.py (Reading 조회, Settings 조회)
    │               └─ src.calculation.calc_history(region, readings)
    │                       → HistoryItem 리스트 JSON 반환
    │
    └─ [ src/api/db.py ]      ← SQLite (data.db). get_session()으로 주입
       [ src/api/models.py ]  ← Reading, Settings 테이블
       [ src/api/schemas.py ] ← 요청/응답 스키마, map_calc_result()
```

---

## 전체 파일 구조

```
src/api/
  main.py         ← FastAPI 앱 진입점. 라우터 등록 + DB 초기화
  db.py           ← SQLite 엔진, 세션 의존성(get_session)
  models.py       ← DB 테이블 정의 (Reading, Settings)
  schemas.py      ← 요청/응답 스키마 + calc() 변환 함수
  routers/
    regions.py    ← GET /regions
    settings.py   ← GET/PUT /settings         [Task 5]
    meter.py      ← POST /meter/scan, /manual  [Task 6]
    history.py    ← GET /history, /period      [Task 7]

tests/api/
  conftest.py     ← 공용 TestClient fixture (인메모리 DB)
  test_models.py
  test_regions.py
  test_schemas.py
  test_settings.py   [Task 5]
  test_meter.py      [Task 6]
  test_history.py    [Task 7]
```

---

## Task 1 — 의존성 추가 + 파일 골격

**역할:** FastAPI 서버에 필요한 패키지를 설치하고 테스트 디렉토리를 준비한다.

**수정 파일:** `pyproject.toml`
**생성 파일:** `src/api/routers/__init__.py`, `tests/__init__.py`, `tests/api/__init__.py`

**추가된 의존성:**

| 패키지 | 역할 |
|---|---|
| `fastapi` | API 서버 프레임워크. 라우터, 의존성 주입, 자동 문서화(Swagger) 제공 |
| `uvicorn[standard]` | FastAPI를 실행하는 ASGI 서버 |
| `sqlmodel` | SQLite ORM. Pydantic 모델과 SQLAlchemy를 통합해 DB 테이블을 Python 클래스로 정의 |
| `python-multipart` | `UploadFile`로 이미지 파일을 받을 때 필요한 multipart 파싱 라이브러리 |
| `pytest` (dev) | 테스트 프레임워크 |
| `httpx` (dev) | FastAPI TestClient가 내부적으로 사용하는 HTTP 클라이언트 |

---

## Task 2 — DB 모델 (models.py + db.py)

**역할:** 데이터를 저장할 SQLite 테이블 구조와 DB 연결 방식을 정의한다.

**생성 파일:** `src/api/models.py`, `src/api/db.py`, `tests/api/test_models.py`

### src/api/models.py — 테이블 정의

**사용자 분리 방식:** 앱이 첫 실행 시 UUID를 생성해 `X-Device-ID` 헤더로 매 요청에 전달한다. 서버는 이 값으로 데이터를 기기별로 완전히 분리한다.

| 클래스 | PK | 주요 컬럼 | 역할 |
|---|---|---|---|
| `Reading` | `id` (자동증가) | `device_id`, `reading_m3`, `confidence`, `input_mode`, `recorded_at` | 검침 기록 한 행. `device_id`에 인덱스를 걸어 기기별 조회 속도를 높임 |
| `Settings` | `device_id` | `region` | 기기별 지역 설정. `device_id`가 PK이므로 기기마다 독립 설정 |

### src/api/db.py — DB 연결

| 함수 | 역할 |
|---|---|
| `create_db_and_tables(engine=None)` | SQLModel이 정의한 모든 테이블을 DB에 생성. 이미 존재하면 무시. `engine` 인자로 테스트용 인메모리 DB를 주입할 수 있음 |
| `get_session()` | FastAPI `Depends(get_session)`으로 라우터에 주입되는 세션 제너레이터. 요청마다 세션을 열고 끝나면 자동으로 닫음 |

---

## Task 3 — 스키마 + calc() 변환 함수 (schemas.py)

**역할:** API 요청/응답의 형태를 Pydantic으로 강제하고, `calc()`의 한국어 키를 영어 키로 변환한다.

**생성 파일:** `src/api/schemas.py`, `tests/api/test_schemas.py`

### src/api/schemas.py

| 클래스/함수 | 사용 엔드포인트 | 역할 |
|---|---|---|
| `ScanResponse` | `POST /meter/scan` 응답 | YOLO 인식 결과 반환. `success=False`면 `reading_m3`, `confidence`는 null |
| `ManualRequest` | `POST /meter/manual` 요청 | 스캔 확정/수동 입력 모두 이 스키마 하나로 처리 |
| `BillSchema` | `ManualResponse` 내부 | 요금 세부 내역 (상수도, 하수도, 물이용부담금, 부가세, 합계) |
| `ImpactSchema` | `ManualResponse` 내부 | 환경 영향 (전력 kWh, CO2 kg) |
| `ManualResponse` | `POST /meter/manual` 응답 | 첫 검침이면 `first_reading=True`, 계산 필드는 모두 null |
| `HistoryItem` | `GET /history` 응답 한 줄 | 구간 라벨 + 사용량 + 요금 합계 + CO2 |
| `SettingsResponse` | `GET/PUT /settings` | 지역 코드 응답/요청 |
| `map_calc_result(dict)` | meter.py, history.py에서 호출 | `calc()` 한국어 키 → 영어 키 변환. `BillSchema`, `ImpactSchema` 객체를 직접 생성해 반환 |

**핵심 흐름:**
```
src.calculation.calc("seoul", 1020, 1043)
  → {"사용량_㎥": 23.0, "요금": {"합계": 29370, ...}, "영향": {...}, "전월_검침_㎥": 1020.0}
  → map_calc_result()
  → {"usage_m3": 23.0, "bill": BillSchema(total=29370, ...), "impact": ImpactSchema(...), "prev_reading_m3": 1020.0}
  → ManualResponse(reading_m3=1043.0, first_reading=False, **result)
```

---

## Task 4 — GET /regions

**역할:** 요금표가 준비된 17개 지역 코드 목록을 앱에 전달한다. 앱은 이 목록으로 지역 선택 UI를 구성한다.

**생성 파일:** `src/api/routers/regions.py`, `src/api/main.py`, `tests/api/conftest.py`, `tests/api/test_regions.py`

### src/api/routers/regions.py

| 함수 | import 출처 | 역할 |
|---|---|---|
| `available_regions()` | `src.calculation` | 17개 지역 코드 리스트 반환. `src/calculation/rates/` 폴더의 JSON 파일명에서 자동 수집 |

### src/api/main.py

| 구성요소 | 역할 |
|---|---|
| `lifespan(app)` | 서버 시작 시 `create_db_and_tables()` 호출해 DB 초기화. 종료 시 정리 |
| `app.include_router(...)` | 라우터를 앱에 등록. 태스크마다 라우터가 추가됨 |

### tests/api/conftest.py

| 구성요소 | 역할 |
|---|---|
| `client_fixture` | 모든 테스트에서 공유하는 pytest fixture. 인메모리 SQLite 엔진을 만들고 `get_session()`을 override해 테스트마다 깨끗한 DB 상태 보장 |

---

## Task 5 — GET/PUT /settings

**역할:** 기기별 지역 설정(어느 지역 요금표를 적용할지)을 저장하고 조회한다.

**생성/수정 파일:** `src/api/routers/settings.py`, `src/api/main.py`, `tests/api/conftest.py`, `tests/api/test_settings.py`

### src/api/routers/settings.py

| 함수 | 역할 |
|---|---|
| `_get_device_id(x_device_id)` | FastAPI `Depends()`로 모든 엔드포인트에 주입되는 헤더 파싱 함수. `X-Device-ID` 헤더가 없으면 400 반환 |
| `get_settings(device_id, session)` | `Settings` 테이블에서 `device_id`로 row 조회. 없으면 `region=null` 반환 |
| `put_settings(body, device_id, session)` | 지역 코드 유효성 검증 후 `session.merge()`로 upsert. 없으면 생성, 있으면 갱신 |

**흐름:**
```
PUT /settings  {"region": "seoul"}  (X-Device-ID: device-A)
    → _get_device_id() → "device-A"
    → available_regions() 검증
    → session.merge(Settings(device_id="device-A", region="seoul"))
    → {"region": "seoul"} 반환
```

### tests/api/conftest.py 핵심 수정 — StaticPool

SQLite `:memory:` DB는 커넥션마다 독립적인 빈 DB를 만든다. 따라서 lifespan에서 테이블을 만들어도 `get_session()`이 여는 새 커넥션은 테이블이 없는 상태다.

**해결책:** `StaticPool`로 모든 커넥션이 같은 메모리 DB를 공유하게 한다.

```python
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,  # 모든 커넥션이 같은 메모리 DB 공유
)
_db._engine = engine  # 모듈 레벨 엔진 교체 → lifespan + get_session() 모두 이 엔진 사용
```

**테스트 격리 방식:** 각 `client` fixture 호출마다 새 엔진이 생성되므로 테스트 간 데이터가 섞이지 않는다.

## Task 6 — POST /meter/scan, /meter/manual

**역할:** 이미지 인식 + 검침값 저장 + 요금 계산을 담당하는 핵심 엔드포인트 두 개.

**생성/수정 파일:** `src/api/routers/meter.py`, `src/api/main.py`, `tests/api/test_meter.py`

### src/api/routers/meter.py

| 함수 | 역할 |
|---|---|
| `post_scan(image)` | `UploadFile`로 받은 이미지를 임시 파일에 저장 → `pipeline.run(path)` 호출 → 결과를 `ScanResponse`로 반환. DB 저장 없음 |
| `post_manual(body, device_id, session)` | 검침값 DB 저장 → 이전 기록 조회 → 지역 설정 확인 → `calc()` 호출 → `ManualResponse` 반환 |

**scan 흐름:**
```
POST /meter/scan  multipart(image=...)
    → UploadFile.read() → tempfile 저장
    → pipeline.run(tmp_path) → [("234918", 0.91)] 또는 []
    → float("234918") / 1000 = 234.918
    → ScanResponse(success=True, reading_m3=234.918, confidence=0.91)
```

**manual 흐름:**
```
POST /meter/manual  {"reading_m3": 1023.0, "input_mode": "manual"}  (X-Device-ID: device-A)
    → Reading 저장 (device_id="device-A", reading_m3=1023.0, ...)
    → prev = 이전 Reading 조회 → 1000.0
    → region = Settings.region → "seoul"
    → calc("seoul", 1000.0, 1023.0) → {사용량, 요금, 영향}
    → map_calc_result() → 영어 키 변환
    → ManualResponse(reading_m3=1023.0, usage_m3=23.0, bill={...}, ...)
```

**설계 결정:**
- `pipeline.run()`이 파일 경로를 받으므로 `NamedTemporaryFile(delete=False)`로 임시 저장 후 `finally`에서 삭제
- 지역 미설정이거나 첫 검침이면 `first_reading=True` 반환 — 계산 없이 저장만
- `calc()`에서 `curr < prev` 시 `ValueError` → 422로 변환
- 테스트에서 `pipeline.run()`은 `monkeypatch.setattr("src.model.pipeline.run", ...)`으로 대체

## Task 7 — GET /history, /history/period

**역할:** 기기의 검침 이력을 구간별로 계산해 반환한다. 월별 그래프 화면에 사용된다.

**생성/수정 파일:** `src/api/routers/history.py`, `src/api/main.py`, `tests/api/conftest.py`, `tests/api/test_history.py`

### src/api/routers/history.py

| 함수 | 역할 |
|---|---|
| `_compute(session, device_id)` | Reading 조회 → `calc_history()` 호출 → `HistoryItem` 변환 → 최신순 정렬. 공통 로직을 두 엔드포인트가 공유 |
| `get_history(...)` | 전체 이력 반환 |
| `get_history_period(start, end, ...)` | `start ≤ start_label AND end_label ≤ end` 조건으로 필터링 후 반환 |

**흐름:**
```
GET /history  (X-Device-ID: device-A)
    → Reading 조회 (시간 오름차순)
    → calc_history("seoul", [("2026-01", 1000), ("2026-02", 1023), ("2026-03", 1043)])
    → [구간1: 2026-01~02, 구간2: 2026-02~03]
    → reversed → 최신 구간이 먼저
    → [HistoryItem(start="2026-02", end="2026-03", ...), HistoryItem(start="2026-01", ...)]

GET /history/period?start=2026-02&end=2026-03
    → 동일한 _compute() 후 start_label/end_label로 필터
```

**설계 결정:**
- `/history/period`를 `/history`보다 먼저 등록 — 구체적인 경로가 먼저 매칭되도록
- `start`, `end` 쿼리 파라미터에 `pattern=r"^\d{4}-\d{2}$"` 검증 → 형식 위반 시 422
- 지역 미설정이거나 검침 2개 미만이면 빈 리스트 반환 (에러 아님)
- label = `recorded_at.strftime("%Y-%m")` — 같은 달 검침이 여러 개면 모두 같은 label

### tests/api/conftest.py — session fixture 추가

테스트에서 특정 날짜의 Reading을 직접 DB에 삽입하기 위해 `session` fixture를 추가했다.
`client` fixture에 의존해 `_db._engine`이 인메모리 엔진으로 교체된 상태에서 세션을 연다.

```python
@pytest.fixture(name="session")
def session_fixture(client):
    from sqlmodel import Session
    with Session(_db._engine) as s:
        yield s
```

## Task 8 — Dockerfile

**역할:** FastAPI 서버를 EC2 t2.micro에 컨테이너로 배포한다.

**생성/수정 파일:** `Dockerfile`, `.dockerignore`, `src/api/db.py`, `.gitignore`

### 설계 결정

| 항목 | 선택 | 이유 |
|---|---|---|
| 베이스 이미지 | `python:3.12-slim` | 최소 크기, Debian 기반 |
| 패키지 매니저 | `uv` (ghcr.io 이미지에서 복사) | 기존 uv.lock 활용, 빠른 설치 |
| onnxruntime | GPU → CPU 교체 | t2.micro는 CUDA 없음. `uv pip install onnxruntime`으로 덮어씀 |
| data.db 위치 | `data/data.db`로 변경 | 디렉토리 단위로 볼륨 마운트 가능 |

### 실행 방법

```bash
# 이미지 빌드
docker build -t smart-meter .

# 컨테이너 실행 (데이터 영속화)
docker run -p 8000:8000 \
  -v ./weights:/app/weights \
  -v ./data:/app/data \
  smart-meter
```

- `weights/` 볼륨: YOLO 모델이 첫 요청 시 자동 다운로드되고 재시작 후에도 유지
- `data/` 볼륨: SQLite DB가 컨테이너 재시작 후에도 유지
