# 가계부 서울 날짜와 이전 검침 안내 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 검침 이력을 실제 서울 날짜로 표시하고 직접 입력·사진 확인 화면에서 오늘 이전의 실제 검침값을 안내한다.

**Architecture:** 백엔드는 UTC naive 검침 시각을 서울 날짜 라벨로 변환하고 `GET /meter/previous`로 오늘 이전의 최신 행을 제공한다. 프론트는 이 요청만 독립적으로 실패 허용한 뒤 `CameraFlow`에 전달하며, 작은 포맷 유틸리티로 두 입력 화면의 문구를 일관되게 만든다.

**Tech Stack:** Python 3.12, FastAPI, SQLModel, pytest, React 19, Node test runner, Vite 8, Capacitor 8, Android Gradle.

## Global Constraints

- `dev`와 `main`에 직접 커밋하지 않고 `codex/reading-date-context`에서만 작업한다.
- UTC 저장 형식과 기존 DB 행은 변경하지 않는다.
- 모든 기록에 서울 날짜 변환을 적용하고 일·월·연도 경계를 처리한다.
- 표시 문구는 `어제 검침`이 아니라 `이전 검침`을 사용한다.
- 하루 한 번 신규 저장, 오늘 기록 수정, 계량기 교체 정책은 변경하지 않는다.
- 모델 정확도와 카메라 촬영 흐름은 변경하지 않는다.
- 새 라이브러리를 추가하지 않는다.
- `output/android`의 기존 미추적 캡처 파일은 수정하거나 삭제하지 않는다.
- 각 태스크의 테스트가 통과한 뒤 명시된 메시지로 커밋하며 `Co-Authored-By`를 넣지 않는다.

---

### Task 1: 가계부 이력 날짜를 서울 기준으로 변환

**Files:**
- Modify: `tests/api/test_history.py`
- Modify: `src/api/routers/history.py`

**Interfaces:**
- Consumes: SQLite에 UTC naive `datetime`으로 저장된 `Reading.recorded_at`.
- Produces: `_seoul_date_label(recorded_at: datetime) -> str`과 서울 날짜를 담은 `HistoryItem.start_label`, `HistoryItem.end_label`.

- [ ] **Step 1: 날짜 경계 회귀 테스트를 작성한다.**

`tests/api/test_history.py`의 datetime import에 `timedelta`, `timezone`을 추가하고 다음 테스트를 작성한다.

```python
def test_history_labels_use_seoul_dates_across_day_month_and_year(client, session):
    rows = [
        (1000.0, datetime(2026, 7, 19, 16, 0)),
        (1001.0, datetime(2026, 7, 31, 16, 0)),
        (1002.0, datetime(2026, 12, 31, 16, 0)),
    ]
    for reading_m3, recorded_at in rows:
        session.add(Reading(
            device_id="device-A",
            reading_m3=reading_m3,
            confidence=None,
            input_mode="manual",
            recorded_at=recorded_at,
        ))
    session.commit()

    items = client.get("/history", headers=HEADERS_A).json()

    assert [(item["start_label"], item["end_label"]) for item in reversed(items)] == [
        ("2026-07-20", "2026-08-01"),
        ("2026-08-01", "2027-01-01"),
    ]
```

- [ ] **Step 2: 테스트가 UTC 날짜를 반환하며 실패하는지 확인한다.**

Run: `uv run pytest tests/api/test_history.py::test_history_labels_use_seoul_dates_across_day_month_and_year -v`

Expected: FAIL. 실제 라벨은 `2026-07-19`, `2026-07-31`, `2026-12-31`을 포함한다.

- [ ] **Step 3: 서울 날짜 변환을 최소 구현한다.**

`src/api/routers/history.py`에 다음 import와 함수를 추가하고 두 `strftime` 호출을 교체한다.

```python
from datetime import datetime, timedelta, timezone

SEOUL = timezone(timedelta(hours=9))


def _seoul_date_label(recorded_at: datetime) -> str:
    utc_time = recorded_at
    if utc_time.tzinfo is None:
        utc_time = utc_time.replace(tzinfo=timezone.utc)
    return utc_time.astimezone(SEOUL).date().isoformat()
```

```python
labeled = [
    (_seoul_date_label(prev.recorded_at), prev.reading_m3),
    (_seoul_date_label(current.recorded_at), current.reading_m3),
]
```

- [ ] **Step 4: 날짜 테스트와 전체 이력 테스트를 실행한다.**

Run: `uv run pytest tests/api/test_history.py -v`

Expected: 모든 `tests/api/test_history.py` 테스트 PASS.

- [ ] **Step 5: 날짜 변환을 커밋한다.**

```powershell
git add tests/api/test_history.py src/api/routers/history.py
git commit -m "fix: 가계부 이력 날짜를 서울 기준으로 변환"
```

---

### Task 2: 오늘 이전의 최신 검침 조회 API 추가

**Files:**
- Modify: `src/api/schemas.py`
- Modify: `src/api/routers/meter.py`
- Modify: `tests/api/test_meter.py`

**Interfaces:**
- Consumes: `_seoul_day_bounds()`가 반환하는 오늘의 UTC naive 시작 시각.
- Produces: `GET /meter/previous -> PreviousReadingResponse | null`.
- Produces type: `PreviousReadingResponse(reading_m3: float, recorded_at: datetime)`.

- [ ] **Step 1: 이전 기록 선택·빈 상태·기기 분리 테스트를 작성한다.**

`tests/api/test_meter.py`에 다음 테스트를 추가한다. 기존 파일의 `HEADERS_A`와 session fixture를 그대로 사용한다.

```python
def test_get_previous_excludes_today_and_returns_latest_earlier_reading(client, session):
    start, _ = _seoul_day_bounds()
    session.add(Reading(
        device_id="device-A",
        reading_m3=225.654,
        confidence=None,
        input_mode="manual",
        recorded_at=start - timedelta(hours=1),
    ))
    session.add(Reading(
        device_id="device-A",
        reading_m3=225.754,
        confidence=None,
        input_mode="manual",
        recorded_at=start + timedelta(hours=1),
    ))
    session.commit()

    response = client.get("/meter/previous", headers=HEADERS_A)

    assert response.status_code == 200
    assert response.json()["reading_m3"] == 225.654
    assert response.json()["recorded_at"].startswith(
        (start - timedelta(hours=1)).isoformat(timespec="seconds")
    )


def test_get_previous_returns_null_without_earlier_reading(client):
    response = client.get("/meter/previous", headers=HEADERS_A)
    assert response.status_code == 200
    assert response.json() is None


def test_get_previous_is_device_scoped(client, session):
    start, _ = _seoul_day_bounds()
    session.add(Reading(
        device_id="device-B",
        reading_m3=999.999,
        confidence=None,
        input_mode="manual",
        recorded_at=start - timedelta(hours=1),
    ))
    session.commit()

    assert client.get("/meter/previous", headers=HEADERS_A).json() is None
```

테스트 import에 `from src.api.routers.meter import _seoul_day_bounds`가 없다면 추가한다.

- [ ] **Step 2: 새 경로가 없어서 실패하는지 확인한다.**

Run: `uv run pytest tests/api/test_meter.py -k "get_previous" -v`

Expected: 세 테스트가 404 응답으로 FAIL.

- [ ] **Step 3: 응답 스키마를 추가한다.**

`src/api/schemas.py`에서 `TodayReadingResponse` 앞에 추가한다.

```python
class PreviousReadingResponse(BaseModel):
    """GET /meter/previous 응답."""

    reading_m3: float
    recorded_at: datetime
```

- [ ] **Step 4: 이전 기록 API를 구현한다.**

`src/api/routers/meter.py`의 schema import에 `PreviousReadingResponse`를 추가하고 `get_today` 앞에 다음 경로를 둔다.

```python
@router.get("/meter/previous", response_model=Optional[PreviousReadingResponse])
def get_previous(
    device_id: str = Depends(_get_device_id),
    session: Session = Depends(get_session),
):
    """한국 날짜 기준 오늘 이전의 마지막 검침을 반환한다."""
    start, _ = _seoul_day_bounds()
    return session.exec(
        select(Reading)
        .where(
            Reading.device_id == device_id,
            Reading.recorded_at < start,
        )
        .order_by(Reading.recorded_at.desc())
    ).first()
```

- [ ] **Step 5: 이전 기록 API 테스트와 전체 Python 테스트를 실행한다.**

Run: `uv run pytest tests/api/test_meter.py -k "get_previous" -v`

Expected: 3 passed.

Run: `uv run pytest`

Expected: 기존 52개와 신규 4개를 포함해 최소 56개 테스트 PASS.

- [ ] **Step 6: 이전 기록 API를 커밋한다.**

```powershell
git add src/api/schemas.py src/api/routers/meter.py tests/api/test_meter.py
git commit -m "feat: 이전 검침 조회 API 추가"
```

---

### Task 3: 직접 입력과 사진 확인 화면에 실제 이전 검침 표시

**Files:**
- Create: `frontend/src/readingContext.js`
- Create: `frontend/tests/reading-context.test.mjs`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/CameraFlow.jsx`
- Modify: `frontend/tests/pre-capacitor-integration.test.mjs`

**Interfaces:**
- Consumes: `GET /meter/previous`의 `{ reading_m3, recorded_at } | null`.
- Produces: `getPreviousReading() -> Promise<PreviousReading | null>`.
- Produces: `formatPreviousReading(previousReading) -> string`.
- `CameraFlow` 새 속성: `previousReading`.

- [ ] **Step 1: 포맷 유틸리티의 날짜 경계와 빈 상태 테스트를 작성한다.**

새 파일 `frontend/tests/reading-context.test.mjs`를 다음 내용으로 만든다.

```javascript
// 이전 검침값과 서울 날짜 안내 문구를 검증하는 테스트
import test from 'node:test'
import assert from 'node:assert/strict'
import { formatPreviousReading } from '../src/readingContext.js'

test('이전 검침을 서울 날짜와 소수점 세 자리로 표시한다', () => {
  assert.equal(formatPreviousReading({
    reading_m3: 225.654,
    recorded_at: '2026-07-19T16:00:00',
  }), '이전 검침 225.654㎥ · 7/20')
})

test('연도 경계를 서울 날짜로 표시한다', () => {
  assert.equal(formatPreviousReading({
    reading_m3: 1000,
    recorded_at: '2026-12-31T16:00:00Z',
  }), '이전 검침 1000.000㎥ · 1/1')
})

test('이전 기록이 없으면 빈 상태를 표시한다', () => {
  assert.equal(formatPreviousReading(null), '이전 검침 기록이 없습니다')
})
```

- [ ] **Step 2: 유틸리티 파일이 없어 실패하는지 확인한다.**

Run: `node --test frontend/tests/reading-context.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: 서울 날짜 포맷 유틸리티를 최소 구현한다.**

새 파일 `frontend/src/readingContext.js`를 다음 내용으로 만든다.

```javascript
// 이전 검침값과 UTC 저장 시각을 입력 화면 안내 문구로 변환한다
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000

function seoulMonthDay(recordedAt) {
  const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/.test(recordedAt) ? recordedAt : `${recordedAt}Z`
  const seoul = new Date(new Date(timestamp).getTime() + SEOUL_OFFSET_MS)
  return `${seoul.getUTCMonth() + 1}/${seoul.getUTCDate()}`
}

export function formatPreviousReading(previousReading) {
  if (!previousReading) return '이전 검침 기록이 없습니다'
  return `이전 검침 ${Number(previousReading.reading_m3).toFixed(3)}㎥ · ${seoulMonthDay(previousReading.recorded_at)}`
}
```

- [ ] **Step 4: 포맷 유틸리티 테스트를 통과시킨다.**

Run: `node --test frontend/tests/reading-context.test.mjs`

Expected: 3 passed.

- [ ] **Step 5: API·상태·화면 연결 계약의 RED 테스트를 추가한다.**

`frontend/tests/pre-capacitor-integration.test.mjs`에 다음 테스트를 추가한다.

```javascript
test('앱은 이전 검침을 독립적으로 조회해 두 입력 화면에 전달한다', () => {
  assert.match(api, /export async function getPreviousReading\(\)/)
  assert.match(api, /request\(["']\/meter\/previous["']\)/)
  assert.match(app, /getPreviousReading\(\)\.catch\(\(\) => null\)/)
  assert.match(app, /const \[previousReading, setPreviousReading\] = useState\(null\)/)
  assert.match(app, /<CameraFlow[\s\S]*previousReading=\{previousReading\}/)
  assert.match(cameraFlow, /function CameraFlow\(\{[\s\S]*previousReading[\s\S]*\}\)/)
})

test('직접 입력과 사진 확인은 실제 이전 검침 안내를 공유한다', () => {
  assert.match(cameraFlow, /formatPreviousReading\(previousReading\)/)
  assert.ok((cameraFlow.match(/\{previousReadingText\}/g) || []).length >= 2)
  assert.doesNotMatch(cameraFlow, /어제 검침 0234\.412/)
})
```

- [ ] **Step 6: 연결 계약이 아직 없어 실패하는지 확인한다.**

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs`

Expected: 위 두 테스트 FAIL.

- [ ] **Step 7: API 클라이언트와 앱 상태를 연결한다.**

`frontend/src/api.js`에 추가한다.

```javascript
export async function getPreviousReading() {
  return request('/meter/previous')
}
```

`frontend/src/App.jsx`의 API import에 `getPreviousReading`을 추가하고 상태를 추가한다.

```javascript
const [previousReading, setPreviousReading] = useState(null)
```

초기 조회를 다음 구조로 바꾼다. 이전 기록 요청만 실패를 `null`로 격리한다.

```javascript
void Promise.all([
  getTodayReading(),
  getPreviousReading().catch(() => null),
  getHistory(),
]).then(([todayReading, previousReading, history]) => {
  if (!active) return
  setTodayReading(todayReading)
  setPreviousReading(previousReading)
  setStreak(calculateReadingStreak(history, todayReading))
  patch({
    recorded: Boolean(todayReading),
    lastReadingDate: todayReading ? localDateKeyFromUtcTimestamp(todayReading.recorded_at) : null,
  })
}).catch(() => {})
```

`CameraFlow` 호출에 `previousReading={previousReading}`을 추가하고 `resetApplication`에서 `setPreviousReading(null)`을 호출한다.

- [ ] **Step 8: 두 입력 화면의 고정 문구를 실제 값으로 교체한다.**

`frontend/src/components/CameraFlow.jsx`에서 유틸리티를 import하고 속성과 문구를 추가한다.

```javascript
import { formatPreviousReading } from '../readingContext.js'
```

```javascript
function CameraFlow({ scenario, goal, startStep, todayReading, previousReading, onClose, onReadingSaved, onDone }) {
  // 기존 코드 유지
  const previousReadingText = formatPreviousReading(previousReading)
```

직접 입력 Card에서 `SectionLabel` 바로 아래에 넣는다.

```jsx
<div style={{ margin: '-2px 0 12px', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: BGC.sub }}>
  {previousReadingText}
</div>
```

사진 인식 확인 Card의 고정 `어제 검침 0234.412 ㎥` div를 다음으로 교체한다.

```jsx
<div style={{ fontSize: 11.5, opacity: 0.65, marginTop: 4 }}>{previousReadingText}</div>
```

- [ ] **Step 9: 프론트 전체 테스트와 Vite 빌드를 실행한다.**

Run from repository root: `node --test frontend/tests/*.test.mjs`

Expected: 기존 84개와 신규 5개를 포함해 최소 89개 테스트 PASS.

Run from `frontend`: `npm run build`

Expected: `✓ built`와 exit code 0. 기존 chunk-size 경고는 허용한다.

- [ ] **Step 10: 프론트 연결을 커밋한다.**

```powershell
git add frontend/src/readingContext.js frontend/tests/reading-context.test.mjs frontend/src/api.js frontend/src/App.jsx frontend/src/components/CameraFlow.jsx frontend/tests/pre-capacitor-integration.test.mjs
git commit -m "feat: 입력 화면에 이전 검침값 안내"
```

---

### Task 4: 전체 회귀 검증과 Android APK 갱신

**Files:**
- Modify locally: `output/android/banguli-debug.apk`.
- Modify: `output/android/README.md`.

**Interfaces:**
- Consumes: Task 1~3의 백엔드와 프론트 구현.
- Produces: 최신 React 번들을 포함한 Android Debug APK와 재현 가능한 크기·SHA-256 정보.

- [ ] **Step 1: 전체 자동 테스트와 Vite 빌드를 다시 실행한다.**

Run from repository root: `uv run pytest`

Expected: 최소 56개 테스트 PASS.

Run from repository root: `node --test frontend/tests/*.test.mjs`

Expected: 최소 89개 테스트 PASS.

Run from `frontend`: `npm run build`

Expected: `✓ built`와 exit code 0.

- [ ] **Step 2: Capacitor Android 프로젝트를 동기화한다.**

Run from `frontend`: `npx cap sync android`

Expected: Camera Preview, Camera, Local Notifications 플러그인이 등록되고 `Sync finished`로 종료.

- [ ] **Step 3: Android Debug APK를 빌드한다.**

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
Set-Location frontend\android
.\gradlew.bat assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: 전달 APK를 갱신하고 동일성을 확인한다.**

저장소 루트에서 실행한다.

```powershell
Copy-Item -Force frontend\android\app\build\outputs\apk\debug\app-debug.apk output\android\banguli-debug.apk
Get-FileHash frontend\android\app\build\outputs\apk\debug\app-debug.apk -Algorithm SHA256
Get-FileHash output\android\banguli-debug.apk -Algorithm SHA256
Get-Item output\android\banguli-debug.apk | Select-Object Length, LastWriteTime
```

Expected: 두 SHA-256이 동일하고 파일 크기가 0보다 크다.

- [ ] **Step 5: APK 문서에 실제 출력값을 반영한다.**

`output/android/README.md`에서 파일 크기, SHA-256, 생성 시각을 Step 4의 실제 값과 현재 KST 날짜로 `apply_patch`를 사용해 교체한다. 확인된 항목에 다음 문장을 추가한다.

```markdown
- 가계부의 UTC 검침 시각을 서울 날짜로 표시하고 직접 입력·사진 확인 화면에 실제 이전 검침을 안내.
```

- [ ] **Step 6: APK 문서와 Git 상태를 검증하고 커밋한다.**

Run: `git diff --check`

Run: `git status --short`

Expected: 소스 변경은 모두 커밋돼 있고, `output/android/banguli-debug.apk`와 기존 에뮬레이터 캡처만 Git 제외 파일로 남는다.

```powershell
git add output/android/README.md
git commit -m "docs: 이전 검침 안내 APK 정보 갱신"
```

---

### Task 5: EC2 배포와 운영 API 검증

**Files:**
- No tracked source changes.
- Temporary local bundle: `C:\Users\Public\Documents\ESTsoft\CreatorTemp\reading-date-context.bundle`.
- Remote repository: `/home/ubuntu/smart-water-meter-kr`.

**Interfaces:**
- Consumes: 기능 브랜치의 최종 커밋과 EC2의 기존 `weights`, `data` 볼륨.
- Produces: 새 Docker 이미지와 `http://13.53.120.64:8000` 운영 API.

- [ ] **Step 1: 최종 로컬 상태와 커밋을 확인한다.**

```powershell
git status --short --branch
git log -5 --oneline
git diff --check
```

Expected: 현재 브랜치는 `codex/reading-date-context`이고 추적 파일 변경이 없다.

- [ ] **Step 2: 브랜치 번들을 만들고 EC2에 전송한다.**

```powershell
git bundle create C:\Users\Public\Documents\ESTsoft\CreatorTemp\reading-date-context.bundle codex/reading-date-context
git bundle verify C:\Users\Public\Documents\ESTsoft\CreatorTemp\reading-date-context.bundle
scp.exe -i C:\Users\uj070\Desktop\jae.pem `
  C:\Users\Public\Documents\ESTsoft\CreatorTemp\reading-date-context.bundle `
  ubuntu@13.53.120.64:/home/ubuntu/reading-date-context.bundle
```

Expected: bundle verify 성공과 SCP exit code 0.

- [ ] **Step 3: EC2 작업 트리를 기능 브랜치로 전환하고 이미지를 빌드한다.**

```powershell
$commit = git rev-parse --short HEAD
ssh.exe -i C:\Users\uj070\Desktop\jae.pem ubuntu@13.53.120.64 `
  "set -e; cd ~/smart-water-meter-kr; git fetch /home/ubuntu/reading-date-context.bundle codex/reading-date-context; git switch -C codex/reading-date-context FETCH_HEAD; git rev-parse --short HEAD; docker build -t water-meter-api:$commit ."
```

Expected: EC2 HEAD가 로컬 `$commit`과 같고 Docker build 성공.

- [ ] **Step 4: 기존 데이터 마운트를 유지해 컨테이너를 교체한다.**

```powershell
$commit = git rev-parse --short HEAD
ssh.exe -i C:\Users\uj070\Desktop\jae.pem ubuntu@13.53.120.64 `
  "set -e; docker rm -f water-api; docker run -d --name water-api --restart unless-stopped -p 8000:8000 -v /home/ubuntu/smart-water-meter-kr/weights:/app/weights -v /home/ubuntu/smart-water-meter-kr/data:/app/data water-meter-api:$commit"
```

Expected: 새 container ID 출력. `data`와 `weights`를 삭제하거나 초기화하지 않는다.

- [ ] **Step 5: health와 읽기 전용 API를 검증한다.**

```powershell
curl.exe -sS -m 10 http://13.53.120.64:8000/health
curl.exe -sS -m 10 -H "X-Device-ID: codex-reading-date-check" http://13.53.120.64:8000/meter/previous
curl.exe -sS -m 10 -H "X-Device-ID: codex-reading-date-check" http://13.53.120.64:8000/history
```

Expected: health는 `{"status":"ok"}`, 테스트 기기의 previous는 `null`, history는 `[]`.

- [ ] **Step 6: 컨테이너 설정과 자원 상태를 확인한다.**

```powershell
ssh.exe -i C:\Users\uj070\Desktop\jae.pem ubuntu@13.53.120.64 `
  "docker inspect water-api --format '{{.Config.Image}}|{{json .HostConfig.Binds}}|{{json .HostConfig.RestartPolicy}}'; docker stats --no-stream water-api; docker logs --tail 50 water-api"
```

Expected: 새 이미지 태그, 기존 두 bind mount, `unless-stopped`, 정상 Uvicorn 시작 로그.

- [ ] **Step 7: 기능 브랜치를 원격에 푸시하고 실기기 검증을 요청한다.**

Run: `git push -u origin codex/reading-date-context`

테스터에게 `output/android/banguli-debug.apk`를 덮어 설치하도록 안내하고 다음을 확인받는다.

- 어제와 오늘 검침이 실제 기록 날짜로 구분된다.
- 직접 입력 화면에 실제 `이전 검침` 값과 날짜가 표시된다.
- 사진 인식 확인 화면에도 같은 이전 검침이 표시된다.
- 최초 검침 기기는 `이전 검침 기록이 없습니다`를 표시한다.
- 검침 저장·가계부·리포트의 기존 기능이 유지된다.

실기기 확인 전에는 `dev`에 병합하지 않는다.
