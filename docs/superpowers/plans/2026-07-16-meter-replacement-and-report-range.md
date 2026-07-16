# 계량기 교체 기준점과 리포트 기간 표시 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계량기 교체로 낮아진 검침값을 새 기준점으로 안전하게 저장하고, 에너지 리포트에 이번 기간과 이전 기간의 날짜 범위를 표시한다.

**Architecture:** `Reading.is_baseline`이 사용량 계산이 끊기는 지점을 표현하고 `POST /meter/manual`의 `reset_baseline`이 명시적인 사용자 확인을 전달한다. 이력은 기준점으로 들어오는 구간만 생략하며 기준점 이후부터 다시 계산한다. 리포트 날짜는 기존 기간 순수 함수의 결과를 화면 표시에도 재사용한다.

**Tech Stack:** Python 3.12, FastAPI, SQLModel, SQLite, pytest, React 19, Node 내장 테스트, Vite 8.

## Global Constraints

- 작업 브랜치는 `feature_app_merge`이며 `dev`와 `main`에 직접 커밋하지 않는다.
- Capacitor Android 프로젝트 생성과 실기기 E2E는 이 계획의 범위 밖이다.
- 새 라이브러리, TypeScript, 상태관리 도구, CSS 프레임워크를 추가하지 않는다.
- 감소값과 동일값은 `reset_baseline=false`일 때 계속 422로 거절한다.
- 기존 검침 이력은 삭제하지 않는다.
- 기준점 직전 구간은 계산하지 않고 기준점 이후 구간부터 다시 계산한다.
- 주간·월간·연간은 오늘을 포함한 최근 7일·30일·365일 규칙을 유지한다.
- 각 태스크는 RED 확인, 최소 구현, GREEN과 전체 회귀, 독립 리뷰, 의미 단위 커밋 순서로 진행한다.
- 같은 문제가 3회 시도 후에도 해결되지 않으면 중단하고 사용자에게 확인한다.

---

### Task 1: 기준점 열과 기존 SQLite DB 마이그레이션

**Files:**
- Create: `tests/api/test_db.py`
- Modify: `src/api/models.py`
- Modify: `src/api/db.py`

**Interfaces:**
- Consumes: `create_db_and_tables(engine=None)`.
- Produces: `Reading.is_baseline: bool`, 기존 DB에도 반복 안전하게 열을 추가하는 `_ensure_reading_baseline_column(engine)`.

- [x] **Step 1: 기존 스키마 마이그레이션 실패 테스트를 작성한다.**

`tests/api/test_db.py`의 첫 줄에는 `# 기존 SQLite 스키마를 반복 안전하게 확장하는 DB 초기화 테스트`를 넣고 다음 테스트를 작성한다.

```python
from sqlalchemy import inspect
from sqlmodel import create_engine

from src.api.db import create_db_and_tables


def test_create_db_adds_baseline_column_to_legacy_reading_table(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as connection:
        connection.exec_driver_sql("""
            CREATE TABLE reading (
                id INTEGER PRIMARY KEY,
                device_id VARCHAR NOT NULL,
                reading_m3 FLOAT NOT NULL,
                confidence FLOAT,
                input_mode VARCHAR NOT NULL,
                recorded_at DATETIME NOT NULL
            )
        """)

    create_db_and_tables(engine)
    create_db_and_tables(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("reading")}
    assert "is_baseline" in columns
```

- [x] **Step 2: RED를 확인한다.**

Run: `uv run pytest tests/api/test_db.py -v`

Expected: `is_baseline` 열이 없어 assertion이 실패한다.

- [x] **Step 3: 모델과 반복 안전한 마이그레이션을 최소 구현한다.**

`Reading`에 다음 필드를 추가한다.

```python
is_baseline: bool = False  # 계량기 교체 후 사용량 계산을 다시 시작하는 기준점
```

`src/api/db.py`에서 선택된 엔진을 한 번만 결정하고 열 존재 여부를 확인한다.

```python
def _ensure_reading_baseline_column(engine):
    with engine.begin() as connection:
        columns = connection.exec_driver_sql("PRAGMA table_info(reading)").all()
        if not any(column[1] == "is_baseline" for column in columns):
            connection.exec_driver_sql(
                "ALTER TABLE reading ADD COLUMN is_baseline BOOLEAN NOT NULL DEFAULT 0"
            )


def create_db_and_tables(engine=None):
    selected_engine = engine or _engine
    SQLModel.metadata.create_all(selected_engine)
    _ensure_reading_baseline_column(selected_engine)
```

- [x] **Step 4: GREEN과 전체 백엔드 회귀를 확인한다.**

Run: `uv run pytest tests/api/test_db.py -v`

Expected: 신규 테스트가 통과한다.

Run: `uv run pytest -q`

Expected: 전체 테스트가 통과하고 기존 Starlette 경고 외 신규 경고가 없다.

- [x] **Step 5: 커밋한다.**

```bash
git add src/api/db.py src/api/models.py tests/api/test_db.py
git commit -m "feat: 계량기 교체 기준점 스키마 추가"
```

### Task 2: 기준점 저장 API와 이력 구간 분리

**Files:**
- Modify: `src/api/schemas.py`
- Modify: `src/api/routers/meter.py`
- Modify: `src/api/routers/history.py`
- Modify: `tests/api/test_meter.py`
- Modify: `tests/api/test_history.py`

**Interfaces:**
- Consumes: `Reading.is_baseline`.
- Produces: `ManualRequest.reset_baseline: bool`, `ManualResponse.baseline_reset: bool`, 기준점 직전 구간을 생략한 `/history`와 `/history/period`.

- [x] **Step 1: 기준점 저장 API의 실패 테스트를 작성한다.**

`tests/api/test_meter.py`에 다음 테스트를 추가한다.

```python
def test_manual_saves_decreasing_reading_as_new_baseline(client, session):
    client.post(
        "/meter/manual",
        json={"reading_m3": 1000.0, "input_mode": "manual"},
        headers=HEADERS_A,
    )

    resp = client.post(
        "/meter/manual",
        json={
            "reading_m3": 20.0,
            "input_mode": "manual",
            "reset_baseline": True,
        },
        headers=HEADERS_A,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["first_reading"] is False
    assert data["baseline_reset"] is True
    assert data["usage_m3"] is None
    assert data["bill"] is None
    readings = session.exec(
        select(Reading)
        .where(Reading.device_id == HEADERS_A["X-Device-ID"])
        .order_by(Reading.recorded_at.asc())
    ).all()
    assert [row.reading_m3 for row in readings] == [1000.0, 20.0]
    assert [row.is_baseline for row in readings] == [False, True]
```

기존 최초 검침 테스트에는 `assert data["baseline_reset"] is False`를 추가한다. 기존 감소·동일값 거절 테스트는 그대로 유지해 명시적 기준점 요청 없이는 저장되지 않음을 보장한다.

- [x] **Step 2: 기준점 저장 API의 RED를 확인한다.**

Run: `uv run pytest tests/api/test_meter.py -k "baseline or reject_decreasing or reject_equal" -v`

Expected: `baseline_reset` 또는 `reset_baseline` 미지원으로 신규 테스트가 실패하고 기존 거절 테스트는 통과한다.

- [x] **Step 3: 요청·응답 스키마와 저장 분기를 구현한다.**

`src/api/schemas.py`를 다음 계약으로 확장한다.

```python
class ManualRequest(BaseModel):
    reading_m3: float
    confidence: Optional[float] = None
    input_mode: str = "manual"
    reset_baseline: bool = False


class ManualResponse(BaseModel):
    reading_m3: float
    recorded_at: datetime
    first_reading: bool
    baseline_reset: bool = False
    usage_m3: Optional[float] = None
    prev_reading_m3: Optional[float] = None
    bill: Optional[BillSchema] = None
    impact: Optional[ImpactSchema] = None
```

`src/api/routers/meter.py`의 잠금 이후 분기를 다음 순서로 만든다.

```python
baseline_reset = bool(prev and body.reset_baseline)
result = None
if prev and not baseline_reset:
    if body.reading_m3 <= prev.reading_m3:
        raise HTTPException(status_code=422, detail=detail)
    try:
        result = calc(region, prev.reading_m3, body.reading_m3)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

reading = Reading(
    device_id=device_id,
    reading_m3=body.reading_m3,
    confidence=body.confidence,
    input_mode=body.input_mode,
    recorded_at=now,
    is_baseline=baseline_reset,
)
```

커밋 후 응답 분기는 다음과 같이 구분한다.

```python
if not prev:
    return ManualResponse(
        reading_m3=body.reading_m3,
        recorded_at=now,
        first_reading=True,
    )

if baseline_reset:
    return ManualResponse(
        reading_m3=body.reading_m3,
        recorded_at=now,
        first_reading=False,
        baseline_reset=True,
    )

return ManualResponse(
    reading_m3=body.reading_m3,
    recorded_at=now,
    first_reading=False,
    **map_calc_result(result),
)
```

- [x] **Step 4: 기준점 저장 GREEN을 확인한다.**

Run: `uv run pytest tests/api/test_meter.py -k "baseline or reject_decreasing or reject_equal" -v`

Expected: 기준점 저장과 기존 거절 테스트가 모두 통과한다.

- [x] **Step 5: 이력 분리 실패 테스트를 작성한다.**

`tests/api/test_history.py`의 `_r`을 다음과 같이 확장한다.

```python
def _r(session, device_id, reading_m3, year, month, is_baseline=False):
    session.add(Reading(
        device_id=device_id,
        reading_m3=reading_m3,
        confidence=None,
        input_mode="manual",
        recorded_at=datetime(year, month, 15),
        is_baseline=is_baseline,
    ))
    session.commit()
```

다음 테스트를 추가한다.

```python
def test_history_skips_replacement_gap_and_resumes_after_baseline(client, session):
    _r(session, "device-A", 1000.0, 2026, 1)
    _r(session, "device-A", 1100.0, 2026, 2)
    _r(session, "device-A", 20.0, 2026, 3, is_baseline=True)
    _r(session, "device-A", 35.0, 2026, 4)
    client.put("/settings", json={"region": "seoul"}, headers=HEADERS_A)

    items = client.get("/history", headers=HEADERS_A).json()

    assert [(item["start_label"], item["end_label"], item["usage_m3"]) for item in items] == [
        ("2026-03-15", "2026-04-15", 15.0),
        ("2026-01-15", "2026-02-15", 100.0),
    ]
```

- [x] **Step 6: 이력 분리 RED를 확인한다.**

Run: `uv run pytest tests/api/test_history.py -k replacement -v`

Expected: 기존 `calc_history()`가 `1100 → 20`을 계산하며 `ValueError`로 실패한다.

- [x] **Step 7: 기준점으로 들어오는 구간만 생략한다.**

`src/api/routers/history.py`의 단일 `calc_history(region, labeled)` 호출을 인접 쌍 순회로 바꾼다.

```python
periods = []
for previous, current in zip(readings, readings[1:]):
    if current.is_baseline:
        continue
    periods.extend(calc_history(region, [
        (previous.recorded_at.strftime("%Y-%m-%d"), previous.reading_m3),
        (current.recorded_at.strftime("%Y-%m-%d"), current.reading_m3),
    ]))
```

- [x] **Step 8: 이력 GREEN, 동시성 회귀, 전체 백엔드 회귀를 확인한다.**

Run: `uv run pytest tests/api/test_history.py -v`

Run: `uv run pytest tests/api/test_meter.py::test_manual_concurrent_requests_are_serialized -v`

Run: `uv run pytest -q`

Expected: 모두 통과하며 기준점 행은 동시성 잠금 안에서 저장된다.

- [x] **Step 9: 커밋한다.**

```bash
git add src/api/schemas.py src/api/routers/meter.py src/api/routers/history.py tests/api/test_meter.py tests/api/test_history.py
git commit -m "feat: 계량기 교체 기준점부터 검침 계산 재시작"
```

### Task 3: 계량기 교체 확인 UI와 API 연동

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/components/CameraFlow.jsx`
- Modify: `frontend/tests/pre-capacitor-integration.test.mjs`

**Interfaces:**
- Consumes: `saveReading({ reading_m3, confidence, input_mode, reset_baseline })`, `ManualResponse.baseline_reset`.
- Produces: 감소값 422 후 제안 → 설명 확인 → 기준점 저장 → 교체 완료 화면 흐름.

- [x] **Step 1: 프론트 계약의 실패 테스트를 작성한다.**

`pre-capacitor-integration.test.mjs`에서 `api.js`도 읽고 다음 계약을 추가한다.

```javascript
const api = readFileSync(new URL('../src/api.js', import.meta.url), 'utf8')

test('계량기 교체 확인은 명시적인 기준점 요청으로 다시 저장한다', () => {
  assert.match(api, /reset_baseline\s*=\s*false/)
  assert.match(api, /reset_baseline/)
  assert.match(cameraFlow, /계량기를 교체했어요/)
  assert.match(cameraFlow, /기존 기록은 그대로 보관/)
  assert.match(cameraFlow, /reset_baseline:\s*true/)
  assert.match(cameraFlow, /baseline_reset/)
  assert.match(cameraFlow, /새 계량기 기준값을 저장했어요/)
})
```

- [x] **Step 2: 프론트 RED를 확인한다.**

Run: `node --test tests/pre-capacitor-integration.test.mjs`

Expected: `reset_baseline`과 교체 확인 UI가 없어 신규 테스트가 실패한다.

- [x] **Step 3: API 클라이언트 계약을 확장한다.**

`frontend/src/api.js`의 함수를 다음 형태로 바꾼다.

```javascript
export async function saveReading({
  reading_m3,
  confidence = null,
  input_mode,
  reset_baseline = false,
}) {
  return request("/meter/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reading_m3, confidence, input_mode, reset_baseline }),
  });
}
```

- [x] **Step 4: 교체 제안과 최종 확인 상태를 구현한다.**

`CameraFlow`에 다음 상태를 추가한다.

```javascript
const [baselinePrompt, setBaselinePrompt] = useState(null)
```

일반 저장의 422에서 입력 모드를 보존한다.

```javascript
if (caught instanceof ApiError && caught.status === 422) {
  setError('검침값이 이전 기록보다 작거나 같습니다. 값을 확인해주세요.')
  setBaselinePrompt({ inputMode, confirming: false })
} else {
  setError('저장에 실패했습니다. 다시 시도해주세요.')
}
```

최종 확인 저장 함수는 동일 값과 입력 모드를 재사용한다.

```javascript
const confirmBaselineReset = async () => {
  setSaving(true)
  setError('')
  try {
    const result = await saveReading({
      reading_m3: readingM3,
      confidence: baselinePrompt.inputMode === 'auto' ? confidence : null,
      input_mode: baselinePrompt.inputMode,
      reset_baseline: true,
    })
    setSaveResult(result)
    setBaselinePrompt(null)
    setStep('done')
  } catch {
    setError('새 계량기 기준값 저장에 실패했습니다. 다시 시도해주세요.')
  } finally {
    setSaving(false)
  }
}
```

수동 입력과 인식 확인 화면의 오류 아래에 같은 `baselinePrompt` UI를 렌더한다. 첫 단계 버튼은 `계량기를 교체했어요`, 두 번째 단계는 `기존 기록은 그대로 보관되고 교체 전후 구간은 계산하지 않아요.`와 취소·확정 버튼을 제공한다. 확정 버튼은 `confirmBaselineReset`, 취소 버튼은 `setBaselinePrompt(null)`을 호출한다.

```jsx
const baselineNotice = baselinePrompt && (
  <Card style={{ marginTop: 12, border: '1.5px solid #F2C48D' }}>
    {!baselinePrompt.confirming ? (
      <button
        type="button"
        onClick={() => setBaselinePrompt({ ...baselinePrompt, confirming: true })}
      >
        계량기를 교체했어요
      </button>
    ) : (
      <>
        <div>기존 기록은 그대로 보관되고 교체 전후 구간은 계산하지 않아요.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <GhostBtn onClick={() => setBaselinePrompt(null)} style={{ flex: 1 }}>취소</GhostBtn>
          <PrimaryBtn onClick={confirmBaselineReset} disabled={saving} style={{ flex: 1 }}>
            {saving ? '저장 중…' : '새 기준값으로 저장'}
          </PrimaryBtn>
        </div>
      </>
    )}
  </Card>
)
```

숫자를 변경하거나 다시 촬영할 때 오래된 422 확인 상태가 남지 않도록 다음 함수를 숫자 다이얼의 `onChange`에 사용하고 `capture()` 시작에서도 `setBaselinePrompt(null)`을 호출한다.

```javascript
const changeDigit = (index, value) => {
  setDigits((current) => current.map((digit, digitIndex) => (
    digitIndex === index ? value : digit
  )))
  setError('')
  setBaselinePrompt(null)
}
```

`step === 'done' && saveResult?.baseline_reset` 분기는 최초 검침 분기보다 앞에 두고 `새 계량기 기준값을 저장했어요`와 `다음 검침부터 새 기준으로 계산해 드릴게요.`를 표시한다.

```jsx
if (step === 'done' && saveResult?.baseline_reset) {
  return (
    <div data-screen-label="계량기 교체 저장 완료" className="fade-up" style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <Card style={{ textAlign: 'center' }}>
        <MIcon name="restart_alt" size={52} color="#2C8A60"></MIcon>
        <div className="jua" style={{ fontSize: 25, color: BGC.ink, marginTop: 12 }}>새 계량기 기준값을 저장했어요</div>
        <div style={{ color: BGC.sub, fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>다음 검침부터 새 기준으로 계산해 드릴게요.</div>
        <div className="jua" style={{ fontSize: 23, color: BGC.skyDeep, marginTop: 18 }}>{readingM3.toFixed(3)} ㎥</div>
      </Card>
      <PrimaryBtn icon="home" onClick={() => onDone({ firstReading: false, usage: 0, reward: 0 })} style={{ marginTop: 14 }}>방울이에게 가기</PrimaryBtn>
    </div>
  )
}
```

- [x] **Step 5: 프론트 GREEN과 빌드를 확인한다.**

Run: `node --test tests/pre-capacitor-integration.test.mjs tests/task7-integration.test.mjs`

Run: `npm run build`

Expected: 전체 Node 테스트와 Node 24 Vite 빌드가 통과한다. 기존 500kB 청크 경고 외 신규 경고가 없다.

- [x] **Step 6: 커밋한다.**

```bash
git add frontend/src/api.js frontend/src/components/CameraFlow.jsx frontend/tests/pre-capacitor-integration.test.mjs
git commit -m "feat: 계량기 교체 기준값 확인 흐름 추가"
```

### Task 4: 리포트 이번 기간과 이전 기간 날짜 표시

**Files:**
- Modify: `frontend/src/reportData.js`
- Modify: `frontend/src/components/ReportScreen.jsx`
- Modify: `frontend/tests/pre-capacitor-integration.test.mjs`

**Interfaces:**
- Consumes: `getPeriodDateRange(period, now)`, `getPreviousDateRange(from, to)`.
- Produces: `getReportDateRanges(period, from, to, now)`, `formatReportDateRange(range)`, 항상 보이는 이번 기간과 비교 카드의 이전 기간 날짜.

- [x] **Step 1: 날짜 범위 순수 함수 실패 테스트를 작성한다.**

```javascript
test('리포트는 기본 기간과 날짜 지정의 이번·이전 범위를 표시용으로 제공한다', async () => {
  const { getReportDateRanges, formatReportDateRange } = await import('../src/reportData.js')

  const weekly = getReportDateRanges('주간', '', '', new Date('2026-07-16T12:00:00'))
  assert.deepEqual(weekly, {
    current: { from: '2026-07-10', to: '2026-07-16' },
    previous: { from: '2026-07-03', to: '2026-07-09' },
  })
  assert.equal(formatReportDateRange(weekly.current), '2026.07.10 ~ 2026.07.16')

  assert.deepEqual(
    getReportDateRanges('날짜지정', '2026-07-08', '2026-07-14'),
    {
      current: { from: '2026-07-08', to: '2026-07-14' },
      previous: { from: '2026-07-01', to: '2026-07-07' },
    },
  )
})
```

화면 계약 테스트도 추가한다.

```javascript
test('리포트는 로딩과 빈 상태를 포함해 이번·이전 기간 날짜를 표시한다', () => {
  assert.match(report, /getReportDateRanges/)
  assert.match(report, /formatReportDateRange/)
  assert.match(report, /이번 기간/)
  assert.match(report, /이전 기간 사용량/)
  assert.match(report, /이전 기간/)
})
```

- [x] **Step 2: 리포트 RED를 확인한다.**

Run: `node --test --test-name-pattern="리포트" tests/pre-capacitor-integration.test.mjs`

Expected: 신규 함수 export와 화면 표기가 없어 실패한다.

- [x] **Step 3: 날짜 범위와 포맷 순수 함수를 구현한다.**

`frontend/src/reportData.js`에 추가한다.

```javascript
export function getReportDateRanges(period, from, to, now = new Date()) {
  if (period === '날짜지정') {
    return {
      current: { from, to },
      previous: getPreviousDateRange(from, to),
    }
  }
  const range = getPeriodDateRange(period, now)
  return {
    current: { from: range.from, to: range.to },
    previous: { from: range.previousFrom, to: range.previousTo },
  }
}

export function formatReportDateRange(range) {
  const format = (label) => label.replaceAll('-', '.')
  return `${format(range.from)} ~ ${format(range.to)}`
}
```

- [x] **Step 4: 기간 컨트롤과 비교 카드에 날짜를 연결한다.**

`ReportScreen.jsx` import에 두 함수를 추가하고 다음 값을 계산한다.

```javascript
const ranges = getReportDateRanges(period, from, to, now)
const currentRangeLabel = formatReportDateRange(ranges.current)
const previousRangeLabel = formatReportDateRange(ranges.previous)
const periodLabel = isCustom ? currentRangeLabel : period
```

`controls`의 날짜 입력 영역 다음에 항상 보이는 행을 둔다.

```jsx
<div style={{ margin: '8px 2px 0', textAlign: 'center', color: BGC.sub, fontSize: 12.5, fontWeight: 700 }}>
  이번 기간 {currentRangeLabel}
</div>
```

비교 카드의 행 데이터는 날짜까지 포함한다.

```javascript
[
  ['이전 기간 사용량', previousRangeLabel, previousTotal, '#C9DFF0'],
  ['이번 기간 사용량', currentRangeLabel, currentTotal, 'linear-gradient(90deg,#7BCBFF,#2E86C9)'],
]
```

각 행은 다음 형태로 렌더해 왼쪽 제목 아래에 날짜 범위를 표시한다. `controls`가 로딩·오류·빈 이력 반환보다 먼저 구성되므로 이번 기간 표시는 모든 상태에서 유지된다.

```jsx
{[
  ['이전 기간 사용량', previousRangeLabel, previousTotal, '#C9DFF0'],
  ['이번 기간 사용량', currentRangeLabel, currentTotal, 'linear-gradient(90deg,#7BCBFF,#2E86C9)'],
].map(([label, rangeLabel, value, background]) => (
  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
    <div style={{ width: 128 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: BGC.sub }}>{label}</div>
      <div style={{ fontSize: 10.5, color: '#9FB9CC', marginTop: 2 }}>{rangeLabel}</div>
    </div>
    <div style={{ flex: 1, height: 16, borderRadius: 99, background: '#EFF6FC', overflow: 'hidden' }}>
      <div style={{ width: (value / Math.max(1, previousTotal, currentTotal)) * 100 + '%', height: '100%', borderRadius: 99, background }}></div>
    </div>
    <span className="jua" style={{ fontSize: 14, color: BGC.ink, width: 44, textAlign: 'right' }}>{value}L</span>
  </div>
))}
```

- [x] **Step 5: 리포트 GREEN과 전체 프론트 회귀·빌드를 확인한다.**

Run: `node --test tests/pre-capacitor-integration.test.mjs tests/task7-integration.test.mjs`

Run: `npm run build`

Expected: 전체 테스트와 Node 24 빌드가 통과한다.

- [x] **Step 6: 커밋한다.**

```bash
git add frontend/src/reportData.js frontend/src/components/ReportScreen.jsx frontend/tests/pre-capacitor-integration.test.mjs
git commit -m "feat: 에너지 리포트에 비교 기간 날짜 표시"
```

### Task 5: 통합 검증, 배포, 사용자 확인

**Files:**
- Modify: `checklist.md`
- Modify: `context-notes.md`

**Interfaces:**
- Consumes: Task 1~4의 커밋.
- Produces: Capacitor Task 9 시작 여부를 판단할 수 있는 검증 결과.

- [x] **Step 1: 전체 자동 검증을 새로 실행한다.**

Run: `uv run pytest -q`

Run: `node --test tests/pre-capacitor-integration.test.mjs tests/task7-integration.test.mjs`

Run: `npm run build`

Run: `git diff --check`

Expected: 모든 명령이 종료 코드 0이며 기존 경고 외 신규 오류가 없다.

- [x] **Step 2: 로컬 API 흐름을 새 기기 ID로 확인한다.**

순서대로 `1000` 일반 저장, `20` 일반 저장 422, 이력 불변, `20` 기준점 저장 200, `35` 일반 저장, `/history` 조회를 실행한다. 이력에는 `1000→20`이 없고 `20→35` 사용량 15㎥만 존재해야 한다.

```bash
curl -X POST http://127.0.0.1:8000/meter/manual -H "X-Device-ID: replacement-e2e" -H "Content-Type: application/json" -d '{"reading_m3":1000,"input_mode":"manual"}'
curl -X POST http://127.0.0.1:8000/meter/manual -H "X-Device-ID: replacement-e2e" -H "Content-Type: application/json" -d '{"reading_m3":20,"input_mode":"manual"}'
curl -X POST http://127.0.0.1:8000/meter/manual -H "X-Device-ID: replacement-e2e" -H "Content-Type: application/json" -d '{"reading_m3":20,"input_mode":"manual","reset_baseline":true}'
curl -X POST http://127.0.0.1:8000/meter/manual -H "X-Device-ID: replacement-e2e" -H "Content-Type: application/json" -d '{"reading_m3":35,"input_mode":"manual"}'
curl http://127.0.0.1:8000/history -H "X-Device-ID: replacement-e2e"
```

- [x] **Step 3: 로컬 브라우저에서 두 기능을 확인한다.**

감소값 입력 후 교체 제안, 설명 확인, 취소 시 미저장, 확정 시 교체 완료 화면을 확인한다. 주간·월간·연간·날짜 지정의 이번 기간과 비교 카드의 이전 기간 날짜를 확인한다.

- [x] **Step 4: 전체 변경을 독립 리뷰한다.**

설계 커밋의 부모부터 최신 구현 커밋까지 검토해 Critical·Important가 없어야 한다. 발견 시 해당 태스크로 돌아가 TDD로 수정하고 재검토한다.

- [x] **Step 5: `feature_app_merge`만 푸시하고 EC2를 갱신한다.**

원격 URL에 토큰을 넣지 않는다. GitHub 인증이 없으면 로컬 Git bundle을 전송해 EC2를 fast-forward한다. Docker 이미지를 성공적으로 빌드한 뒤에만 `water-api`를 `unless-stopped`, 기존 `data`·`weights` 볼륨으로 교체한다.

- [x] **Step 6: EC2 검증을 실행한다.**

내부·외부 `/health`, 고유 기기 ID의 기준점 저장 흐름, `/history` 분리 결과, 기존 계량기 크롭의 `/meter/scan` `234.918㎥` 결과를 확인한다.

- [x] **Step 7: 사용자 확인을 받는다.**

실제 계량기 사진 E2E, 교체 UI, 리포트 기간 표기를 사용자가 확인할 수 있도록 로컬 서버를 실행한다. 확인 전에는 Capacitor Task 9를 시작하지 않는다.

---

## 최종 완료 조건

- 기준점 없는 감소·동일값은 계속 422이며 DB가 변하지 않는다.
- 사용자 확인이 있는 기준점은 저장되며 교체 전후 구간을 계산하지 않는다.
- 기준점 다음 검침부터 사용량·요금·리포트가 정상 계산된다.
- 리포트의 모든 기간 모드와 모든 로딩 상태에서 이번 기간이 보인다.
- 비교 카드에 이번 기간과 이전 기간의 날짜가 각각 보인다.
- 전체 자동 검증, 로컬 E2E, 독립 리뷰, EC2 E2E가 통과한다.
- 사용자가 웹 기능을 확인하기 전에는 Android 래핑을 시작하지 않는다.
