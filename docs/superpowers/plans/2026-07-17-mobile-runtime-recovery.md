# Android 실기기 런타임 복구 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android 실기기에서 사진 인식 상태, 당일 저장, 이력·리포트와 아이콘이 서버 장애와 레거시 데이터에도 복구 가능하게 동작하도록 한다.

**Architecture:** 순수한 요청 제한 시간 도우미와 당일 저장 조정 함수를 추가해 네트워크와 저장 정책을 UI에서 분리한다. `CameraFlow`는 처리 중 파일과 미리보기 URL을 보존하고, 백엔드 이력 계산은 계산 불가능한 과거 감소 구간만 제외한다.

**Tech Stack:** React 19, Vite 7, Node test runner, FastAPI, SQLModel, pytest, Capacitor 8, Android Gradle.

## Global Constraints

- 사진 인식 제한 시간은 정확히 12초이며 정상 응답은 즉시 처리한다.
- 자동 네트워크 재시도와 백오프는 추가하지 않는다.
- 모델의 `success: false`는 기존 직접 입력 전환을 유지한다.
- 기존 운영 검침값을 삭제·수정하거나 자동으로 교체 이력으로 만들지 않는다.
- YOLOX 모델과 검출 기준, 계정, HTTPS와 AWS 구조는 변경하지 않는다.
- 새 소스 파일 첫 줄에는 파일 역할을 설명하는 한국어 주석을 둔다.

---

### Task 1: 사진 인식 요청 제한 시간

**Files:**
- Create: `frontend/src/requestTimeout.js`
- Create: `frontend/tests/request-timeout.test.mjs`
- Modify: `frontend/src/api.js`

**Interfaces:**
- Produces: `requestWithTimeout(url, options, timeoutMs, fetchImpl = fetch)`.
- Consumes: `/meter/scan`에서 `timeoutMs: 12000`.

- [ ] **Step 1: 실패 테스트를 작성한다.**

`frontend/tests/request-timeout.test.mjs`에서 abort 신호를 기다리는 fake fetch로 20ms 제한 시간이 `TimeoutError`를 발생시키고, 즉시 성공 응답은 그대로 반환하는지 단언한다.

- [ ] **Step 2: RED를 확인한다.**

Run: `node --test frontend/tests/request-timeout.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND` 또는 `requestWithTimeout` 미정의로 실패.

- [ ] **Step 3: 최소 구현을 작성한다.**

```js
// fetch 요청에 선택적 제한 시간을 적용하는 공통 도우미
export async function requestWithTimeout(url, options = {}, timeoutMs = 0, fetchImpl = fetch) {
  if (!timeoutMs) return fetchImpl(url, options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('요청 시간이 초과되었습니다.', 'TimeoutError')), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
```

`api.js`의 `request`에 `timeoutMs`를 분리해 전달하고 `scanMeter`만 12000을 지정한다.

- [ ] **Step 4: GREEN과 전체 Node 테스트를 확인한다.**

Run: `node --test frontend/tests/request-timeout.test.mjs`

Run: `node --test frontend/tests/*.test.mjs`

- [ ] **Step 5: 커밋한다.**

```bash
git add frontend/src/requestTimeout.js frontend/src/api.js frontend/tests/request-timeout.test.mjs
git commit -m "fix: 사진 인식 요청 제한 시간 추가"
```

### Task 2: 사진 미리보기와 실패 재시도

**Files:**
- Modify: `frontend/src/components/CameraFlow.jsx`
- Modify: `frontend/tests/pre-capacitor-integration.test.mjs`

**Interfaces:**
- Consumes: Task 1의 12초 `scanMeter` 실패.
- Produces: 처리 파일 미리보기, `retryFile`, `scanError` 상태와 동일 파일 재시도.

- [ ] **Step 1: 실패 계약 테스트를 추가한다.**

`pre-capacitor-integration.test.mjs`에 `URL.createObjectURL`, `URL.revokeObjectURL`, 처리 사진 `<img>`, `같은 사진 다시 시도`, `직접 입력`과 retry handler가 존재하는지 단언한다.

- [ ] **Step 2: RED를 확인한다.**

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs`

Expected: 사진 URL과 재시도 UI 단언 실패.

- [ ] **Step 3: 최소 상태 전이를 구현한다.**

`capture`에서 획득한 파일을 상태에 보존하고 object URL을 만들어 scan 프레임의 배경 이미지로 표시한다. `scanMeter` 오류는 사진을 유지한 `scan-error` 단계로 이동한다. 같은 사진 재시도는 보존 파일로 분석 함수만 다시 실행하며 직접 입력은 기존 `manual` 단계로 이동한다. 파일 교체·완료·언마운트 때 object URL을 해제한다.

- [ ] **Step 4: focused와 전체 테스트를 통과한다.**

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs frontend/tests/camera-preview.test.mjs`

Run: `node --test frontend/tests/*.test.mjs`

- [ ] **Step 5: 커밋한다.**

```bash
git add frontend/src/components/CameraFlow.jsx frontend/tests/pre-capacitor-integration.test.mjs
git commit -m "fix: 사진 인식 미리보기와 재시도 추가"
```

### Task 3: 오래된 오늘 상태의 409 저장 복구

**Files:**
- Create: `frontend/src/readingSave.js`
- Create: `frontend/tests/reading-save.test.mjs`
- Modify: `frontend/src/components/CameraFlow.jsx`

**Interfaces:**
- Produces: `persistReading({ todayReading, payload, saveReading, updateTodayReading, getTodayReading })`.
- Returns: `{ result, updated }`.

- [ ] **Step 1: 실패 테스트를 작성한다.**

신규 저장이 409일 때 `getTodayReading`을 한 번 호출하고 오늘 기록이 있으면 동일 payload를 PUT 함수에 전달하는지 검증한다. 오늘 기록 재조회가 null이거나 409 이외 오류면 원래 오류를 다시 던지는 테스트도 작성한다.

- [ ] **Step 2: RED를 확인한다.**

Run: `node --test frontend/tests/reading-save.test.mjs`

Expected: 모듈 미존재로 실패.

- [ ] **Step 3: 최소 저장 조정 함수를 구현한다.**

```js
// 오래된 오늘 검침 상태를 서버와 다시 맞춰 저장 방식을 결정하는 도우미
export async function persistReading({ todayReading, payload, saveReading, updateTodayReading, getTodayReading }) {
  if (todayReading) return { result: await updateTodayReading(payload), updated: true };
  try {
    return { result: await saveReading(payload), updated: false };
  } catch (error) {
    if (error?.status !== 409) throw error;
    const current = await getTodayReading();
    if (!current) throw error;
    return { result: await updateTodayReading(payload), updated: true };
  }
}
```

`CameraFlow`의 일반 저장과 교체 기준점 저장이 이 함수를 사용하고 결과의 `updated`를 기존 보상 정책에 반영한다.

- [ ] **Step 4: GREEN과 전체 테스트를 확인한다.**

Run: `node --test frontend/tests/reading-save.test.mjs`

Run: `node --test frontend/tests/*.test.mjs`

- [ ] **Step 5: 커밋한다.**

```bash
git add frontend/src/readingSave.js frontend/src/components/CameraFlow.jsx frontend/tests/reading-save.test.mjs
git commit -m "fix: 당일 검침 저장 충돌 자동 복구"
```

### Task 4: 레거시 감소 이력 방어

**Files:**
- Modify: `tests/api/test_history.py`
- Modify: `src/api/routers/history.py`

**Interfaces:**
- Consumes: 시간순 `Reading` 쌍.
- Produces: 감소·동일 레거시 쌍을 제외한 정상 `HistoryItem` 목록.

- [ ] **Step 1: 실패 회귀 테스트를 작성한다.**

`100 → 20 → 35` 기록을 모두 `is_baseline=False`로 삽입하고 `/history`가 500 대신 `20 → 35`의 15㎥ 한 구간을 반환하는지 검증한다. DB의 세 행과 `is_baseline=False`가 그대로인지도 단언한다.

- [ ] **Step 2: RED를 확인한다.**

Run: `uv run pytest tests/api/test_history.py -q`

Expected: `ValueError`로 실패.

- [ ] **Step 3: 계산 불가능한 한 쌍만 제외한다.**

```python
for prev, current in zip(readings, readings[1:]):
    if current.is_baseline or current.reading_m3 <= prev.reading_m3:
        continue
```

- [ ] **Step 4: GREEN과 전체 pytest를 확인한다.**

Run: `uv run pytest tests/api/test_history.py -q`

Run: `uv run pytest -q`

- [ ] **Step 5: 커밋한다.**

```bash
git add src/api/routers/history.py tests/api/test_history.py
git commit -m "fix: 레거시 감소 구간 이력 계산 제외"
```

### Task 5: 로컬 아이콘과 첫 검침 안내

**Files:**
- Create: `frontend/public/fonts/MaterialSymbolsRounded.woff2`
- Modify: `frontend/index.html`
- Modify: `frontend/src/App.css`
- Modify: `frontend/src/components/CameraFlow.jsx`
- Modify: `frontend/src/components/LedgerScreen.jsx`
- Modify: `frontend/src/components/ReportScreen.jsx`
- Modify: `frontend/tests/pre-capacitor-integration.test.mjs`

**Interfaces:**
- Consumes: Google Material Symbols의 Apache-2.0 WOFF2 변수 폰트.
- Produces: `/fonts/MaterialSymbolsRounded.woff2` 로컬 `@font-face`와 계산 대기 안내.

- [ ] **Step 1: 실패 계약 테스트를 작성한다.**

외부 Google 링크에 `Material+Symbols`가 없고 로컬 WOFF2와 `@font-face`가 있으며, 첫 검침·가계부·리포트에 다음 검침부터 계산된다는 문구가 있는지 단언한다.

- [ ] **Step 2: RED를 확인한다.**

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs`

Expected: 로컬 폰트와 안내 문구 단언 실패.

- [ ] **Step 3: 공식 폰트와 최소 문구를 적용한다.**

공식 Google Material Design Icons 저장소의 `variablefont/MaterialSymbolsRounded[FILL,GRAD,opsz,wght].woff2`를 로컬 파일로 저장한다. `index.html`은 Jua와 Noto Sans KR만 외부 요청하고, `App.css`에 다음을 추가한다.

```css
@font-face {
  font-family: 'Material Symbols Rounded';
  src: url('/fonts/MaterialSymbolsRounded.woff2') format('woff2');
  font-style: normal;
  font-weight: 100 700;
  font-display: block;
}
```

첫 검침 완료와 두 빈 상태는 `이전 검침값이 없어 사용량과 달성률은 다음 검침부터 표시돼요.`를 화면 맥락에 맞게 사용한다.

- [ ] **Step 4: focused 테스트와 Vite 빌드를 확인한다.**

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs`

Run: `node --test frontend/tests/*.test.mjs`

Run: `npm --prefix frontend run build`

- [ ] **Step 5: 커밋한다.**

```bash
git add frontend/public/fonts/MaterialSymbolsRounded.woff2 frontend/index.html frontend/src/App.css frontend/src/components/CameraFlow.jsx frontend/src/components/LedgerScreen.jsx frontend/src/components/ReportScreen.jsx frontend/tests/pre-capacitor-integration.test.mjs
git commit -m "fix: Android 아이콘과 첫 검침 안내 복구"
```

### Task 6: 전체 Android 검증과 전달 APK

**Files:**
- Modify: `output/android/banguli-debug.apk` 로컬 전달본.
- Modify: `output/android/README.md` 빌드 메타데이터만 커밋.
- Modify: `checklist.md`, `context-notes.md` 로컬 추적 노트.

**Interfaces:**
- Produces: 실기기 재검증용 Debug APK.

- [ ] **Step 1: 전체 테스트와 빌드를 실행한다.**

Run: `uv run pytest -q`

Run: `node --test frontend/tests/*.test.mjs`

Run: `npm --prefix frontend run build`

- [ ] **Step 2: Capacitor와 Android를 빌드한다.**

Run from `frontend`: `npx cap sync android`

Run: `frontend/android/gradlew.bat assembleDebug`

- [ ] **Step 3: APK와 번들 내용을 검증한다.**

Gradle APK를 `output/android/banguli-debug.apk`로 복사하고 SHA-256과 크기를 README에 반영한다. APK 자산에서 운영 API 주소와 로컬 Material Symbols WOFF2가 포함됐는지 확인한다.

- [ ] **Step 4: diff와 fresh 검증을 다시 확인한다.**

Run: `git diff --check`

Run: `git status --short`

- [ ] **Step 5: 메타데이터를 커밋하고 사용자에게 실기기 검증을 요청한다.**

```bash
git add output/android/README.md
git commit -m "build: Android 실기기 복구 APK 갱신"
```

실기기에서는 사진 미리보기, 동일 사진 재시도, 당일 수정, 가계부·리포트, 하단 아이콘을 확인한다. EC2에는 Task 4 커밋을 배포한 뒤 `/health`, `/history`와 실제 앱 조회를 재검증한다.
