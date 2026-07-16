# 설정 확장과 매일 검침 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계정 없이 현재 기기 기준으로 매일 검침 알림, 계량기 교체 이력, 글자 크기 개선, 전체 앱 초기화를 제공한다.

**Architecture:** 알림 설정과 마지막 검침일은 기존 `banguli_app_v1` 로컬 상태에 저장하고, Capacitor 플러그인 접근은 `frontend/src/notifications.js` 한 곳으로 제한한다. 교체 이력과 초기화는 `X-Device-ID`로 분리되는 FastAPI 엔드포인트를 추가한다. 서버 데이터 삭제가 성공한 뒤에만 로컬 상태와 기기 ID를 지운다.

**Tech Stack:** FastAPI, SQLModel, pytest, React 19, Vite 8, Node test runner, Capacitor 8 Local Notifications.

## Global Constraints

- 작업 브랜치는 `feature_app_merge`를 유지하고 `dev` 또는 `main`에 직접 커밋하지 않는다.
- 설계 기준은 `docs/superpowers/specs/2026-07-16-settings-notifications-reset-design.md`다.
- 새 소스 파일 첫 줄에는 파일 역할을 설명하는 한국어 한 줄 주석을 넣는다.
- 계획에 없는 상태관리, TypeScript, CSS 프레임워크, 서버 푸시를 추가하지 않는다.
- TDD의 RED를 실제로 확인한 뒤 최소 구현으로 GREEN을 만든다.
- 같은 문제를 세 번 시도해도 해결하지 못하면 중단하고 사용자에게 상황과 로그를 전달한다.
- 실제 Android 권한, 예약 시각 수신, 알림 탭 이동은 기존 Task 9의 appId 확정과 실기기 연결 뒤에 검증한다.
- 각 태스크가 끝날 때 지정 메시지로 커밋하며 `Co-Authored-By`를 넣지 않는다.

---

### Task 1: 계량기 교체 이력 API 추가

**Files:**
- Modify: `src/api/schemas.py`
- Modify: `src/api/routers/history.py`
- Test: `tests/api/test_history.py`

- [ ] **Step 1: 교체 이력 계약의 실패 테스트 작성**

`tests/api/test_history.py`의 `_r`에 `input_mode="manual"` 인자를 추가하고 다음 계약을 테스트한다.

```python
def test_replacement_history_returns_latest_baseline_first(client, session):
    _r(session, "device-A", 1000.0, 2026, 1)
    _r(session, "device-A", 20.0, 2026, 2, is_baseline=True, input_mode="auto")
    _r(session, "device-A", 35.0, 2026, 3)
    _r(session, "device-A", 5.0, 2026, 4, is_baseline=True)

    response = client.get("/history/replacements", headers=HEADERS_A)

    assert response.status_code == 200
    assert response.json() == [
        {
            "replaced_at": "2026-04-15T00:00:00",
            "previous_reading_m3": 35.0,
            "baseline_reading_m3": 5.0,
            "input_mode": "manual",
        },
        {
            "replaced_at": "2026-02-15T00:00:00",
            "previous_reading_m3": 1000.0,
            "baseline_reading_m3": 20.0,
            "input_mode": "auto",
        },
    ]


def test_replacement_history_is_device_scoped_and_allows_missing_previous(client, session):
    _r(session, "device-A", 7.0, 2026, 2, is_baseline=True)
    _r(session, "device-B", 900.0, 2026, 1)
    _r(session, "device-B", 10.0, 2026, 2, is_baseline=True)

    response = client.get("/history/replacements", headers=HEADERS_A)

    assert response.status_code == 200
    assert response.json()[0]["previous_reading_m3"] is None
    assert len(response.json()) == 1
```

- [ ] **Step 2: RED 확인**

Run: `uv run pytest tests/api/test_history.py -q`

Expected: `/history/replacements`가 아직 없으므로 새 테스트가 404로 실패한다.

- [ ] **Step 3: 응답 스키마와 엔드포인트 최소 구현**

`src/api/schemas.py`에 다음 스키마를 추가한다.

```python
class ReplacementHistoryItem(BaseModel):
    """GET /history/replacements 응답의 교체 이력 한 줄."""
    replaced_at: datetime
    previous_reading_m3: Optional[float] = None
    baseline_reading_m3: float
    input_mode: str
```

`src/api/routers/history.py`에서 `ReplacementHistoryItem`을 import하고, 반드시 `/history/{...}` 형태보다 먼저 다음 고정 경로를 등록한다.

```python
@router.get("/history/replacements", response_model=list[ReplacementHistoryItem])
def get_replacement_history(
    device_id: str = Depends(_get_device_id),
    session: Session = Depends(get_session),
):
    readings = session.exec(
        select(Reading)
        .where(Reading.device_id == device_id)
        .order_by(Reading.recorded_at.asc())
    ).all()
    replacements = [
        ReplacementHistoryItem(
            replaced_at=reading.recorded_at,
            previous_reading_m3=readings[index - 1].reading_m3 if index else None,
            baseline_reading_m3=reading.reading_m3,
            input_mode=reading.input_mode,
        )
        for index, reading in enumerate(readings)
        if reading.is_baseline
    ]
    return list(reversed(replacements))
```

- [ ] **Step 4: GREEN과 회귀 테스트 확인**

Run: `uv run pytest tests/api/test_history.py -q`

Expected: 파일의 모든 테스트가 통과한다.

Run: `uv run pytest -q`

Expected: 전체 pytest가 통과한다.

- [ ] **Step 5: 커밋**

```bash
git add src/api/schemas.py src/api/routers/history.py tests/api/test_history.py
git commit -m "feat: 계량기 교체 이력 API 추가"
```

---

### Task 2: 현재 기기 데이터 초기화 API 추가

**Files:**
- Create: `src/api/routers/device.py`
- Modify: `src/api/main.py`
- Create: `tests/api/test_device.py`

- [ ] **Step 1: 기기 분리와 멱등성을 검증하는 실패 테스트 작성**

`tests/api/test_device.py`를 다음 계약으로 작성한다.

```python
# 현재 기기 데이터 전체 삭제 API를 검증하는 테스트
from datetime import datetime

from sqlmodel import select

from src.api.models import Reading, Settings


def _seed(session, device_id):
    session.add(Reading(
        device_id=device_id,
        reading_m3=100.0,
        input_mode="manual",
        recorded_at=datetime(2026, 1, 15),
    ))
    session.add(Settings(device_id=device_id, region="seoul"))
    session.commit()


def test_delete_device_data_removes_only_current_device(client, session):
    _seed(session, "device-A")
    _seed(session, "device-B")

    response = client.delete("/device-data", headers={"X-Device-ID": "device-A"})

    assert response.status_code == 204
    assert session.exec(select(Reading).where(Reading.device_id == "device-A")).all() == []
    assert session.get(Settings, "device-A") is None
    assert client.get("/history", headers={"X-Device-ID": "device-A"}).json() == []
    assert client.get("/settings", headers={"X-Device-ID": "device-A"}).json() == {"region": "seoul"}
    assert session.get(Settings, "device-B") is not None


def test_delete_device_data_is_idempotent(client):
    headers = {"X-Device-ID": "device-A"}
    assert client.delete("/device-data", headers=headers).status_code == 204
    assert client.delete("/device-data", headers=headers).status_code == 204


def test_delete_device_data_requires_device_header(client):
    assert client.delete("/device-data").status_code == 400
```

- [ ] **Step 2: RED 확인**

Run: `uv run pytest tests/api/test_device.py -q`

Expected: `/device-data`가 없어 404로 실패한다.

- [ ] **Step 3: 단일 트랜잭션 삭제 라우터 구현**

`src/api/routers/device.py`를 다음 내용으로 만든다.

```python
# 현재 기기의 검침과 설정 데이터를 전체 삭제하는 API 라우터
from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session, select

from src.api.db import get_session
from src.api.models import Reading, Settings
from src.api.routers.settings import _get_device_id

router = APIRouter()


@router.delete("/device-data", status_code=status.HTTP_204_NO_CONTENT)
def delete_device_data(
    device_id: str = Depends(_get_device_id),
    session: Session = Depends(get_session),
):
    readings = session.exec(select(Reading).where(Reading.device_id == device_id)).all()
    for reading in readings:
        session.delete(reading)
    settings_row = session.get(Settings, device_id)
    if settings_row is not None:
        session.delete(settings_row)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

`src/api/main.py`의 라우터 import에 `device`를 추가하고 `app.include_router(device.router)`를 등록한다.

- [ ] **Step 4: GREEN과 회귀 테스트 확인**

Run: `uv run pytest tests/api/test_device.py -q`

Expected: 새 테스트 3개가 통과한다.

Run: `uv run pytest -q`

Expected: 전체 pytest가 통과한다.

- [ ] **Step 5: 커밋**

```bash
git add src/api/routers/device.py src/api/main.py tests/api/test_device.py
git commit -m "feat: 현재 기기 데이터 초기화 API 추가"
```

---

### Task 3: Capacitor 로컬 알림 어댑터 추가

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/notifications.js`
- Create: `frontend/tests/notifications.test.mjs`

- [ ] **Step 1: 공식 플러그인 설치**

Run: `npm --prefix frontend install @capacitor/local-notifications@^8.0.0`

Expected: `package.json`과 lock 파일에 Capacitor 8 플러그인만 추가된다.

- [ ] **Step 2: 순수 예약 계산과 플러그인 경계의 실패 테스트 작성**

테스트에는 다음 사례를 넣는다.

- 19시에 20시 알림을 만들면 첫 예약은 오늘이고 총 60개다.
- 오늘 검침했거나 현재 시각이 20시를 지났으면 첫 예약은 내일이다.
- 알림 ID는 60개 모두 고유하고 `extra`는 `{ kind: 'daily-meter-reminder', route: 'camera' }`다.
- 권한 거절 시 예약하지 않고 `{ enabled: false, reason: 'permission-denied' }`를 반환한다.
- 끄기는 방울이 알림만 취소한다.
- 예약 실패 시 이전 pending 알림을 복원하고 오류를 다시 던진다.
- action event 중 `route === 'camera'`만 콜백을 실행한다.

- [ ] **Step 3: RED 확인**

Run: `node --test frontend/tests/notifications.test.mjs`

Expected: `frontend/src/notifications.js`가 없어 모듈 로드 단계에서 실패한다.

- [ ] **Step 4: 어댑터 최소 구현**

`frontend/src/notifications.js`는 다음 공개 계약을 구현한다.

```javascript
// 매일 검침 로컬 알림의 권한과 예약 및 탭 동작을 관리하는 어댑터
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

export const REMINDER_DAYS = 60
export const REMINDER_KIND = 'daily-meter-reminder'

export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildReminderNotifications({ time, lastReadingDate, now = new Date() }) {
  const [hour, minute] = time.split(':').map(Number)
  const first = new Date(now)
  first.setHours(hour, minute, 0, 0)
  if (first <= now || localDateKey(first) === lastReadingDate) first.setDate(first.getDate() + 1)

  return Array.from({ length: REMINDER_DAYS }, (_, offset) => {
    const at = new Date(first)
    at.setDate(first.getDate() + offset)
    return {
      id: 100000000 + Number(localDateKey(at).replaceAll('-', '')),
      title: '방울이가 마를 것 같아요!',
      body: '오늘의 수도 계량기를 검침해 주세요.',
      schedule: { at, allowWhileIdle: false },
      autoCancel: true,
      extra: { kind: REMINDER_KIND, route: 'camera' },
    }
  })
}

export function createNotificationService({
  plugin = LocalNotifications,
  isNative = Capacitor.isNativePlatform(),
} = {}) {
  const owned = (notification) => notification.extra?.kind === REMINDER_KIND
  const pendingOwned = async () => (await plugin.getPending()).notifications.filter(owned)
  const cancelOwned = async (notifications) => {
    if (notifications.length) await plugin.cancel({ notifications })
  }

  const replace = async ({ time, lastReadingDate, requestPermission }) => {
    if (!isNative) return { enabled: true }
    let permission = await plugin.checkPermissions()
    if (permission.display !== 'granted' && requestPermission) permission = await plugin.requestPermissions()
    if (permission.display !== 'granted') return { enabled: false, reason: 'permission-denied' }

    const previous = await pendingOwned()
    await cancelOwned(previous)
    try {
      await plugin.schedule({ notifications: buildReminderNotifications({ time, lastReadingDate }) })
      return { enabled: true }
    } catch (error) {
      if (previous.length) await plugin.schedule({ notifications: previous })
      throw error
    }
  }

  return {
    enable: (settings) => replace({ ...settings, requestPermission: true }),
    refresh: (settings) => replace({ ...settings, requestPermission: false }),
    disable: async () => {
      if (isNative) await cancelOwned(await pendingOwned())
    },
    listenForActions: async (openCamera) => {
      if (!isNative) return { remove: async () => {} }
      return plugin.addListener('localNotificationActionPerformed', (event) => {
        if (event.notification.extra?.route === 'camera') openCamera()
      })
    },
  }
}

export const notificationService = createNotificationService()
```

예약 실패 롤백 테스트에서 mock pending 객체가 다시 `schedule`에 전달되는지 확인한다. exact alarm 권한이나 manifest 변경은 하지 않는다.

- [ ] **Step 5: GREEN과 빌드 확인**

Run: `node --test frontend/tests/notifications.test.mjs`

Expected: 알림 테스트가 모두 통과한다.

Run: `npm --prefix frontend run build`

Expected: Vite production build가 성공한다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/notifications.js frontend/tests/notifications.test.mjs
git commit -m "feat: 매일 검침 로컬 알림 어댑터 추가"
```

---

### Task 4: 알림 설정과 검침 완료 및 알림 탭 이동 연동

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/SettingsScreen.jsx`
- Modify: `frontend/tests/pre-capacitor-integration.test.mjs`
- Modify: `frontend/tests/notifications.test.mjs`

- [ ] **Step 1: 화면 연동 계약의 실패 테스트 작성**

다음 계약을 테스트에 추가한다.

- 기본 상태는 `notificationEnabled: false`, `notificationTime: '20:00'`, `lastReadingDate: null`이다.
- 설정 화면은 알림 토글, `type="time"`, 안내 문구, 권한 거절, 예약 오류와 다시 시도 상태를 표시한다.
- 켜기와 시각 변경 성공 뒤에만 `patch`가 호출된다.
- 검침 저장 성공의 `onDone`에서 로컬 날짜를 기록하고 오늘 알림을 재예약한다.
- 앱 시작과 알림 설정 화면 진입 시 켜진 알림을 refresh하며, action listener가 카메라 화면으로 이동한다.
- 글자 크기 `크게`는 `1.15`를 저장한다.

- [ ] **Step 2: RED 확인**

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs frontend/tests/notifications.test.mjs`

Expected: 기본 상태와 UI 문자열 및 연동 함수가 없어 새 테스트가 실패한다.

- [ ] **Step 3: App에서 알림 생명주기 연결**

`App.jsx`에 `notificationService`와 `localDateKey`를 import하고 기본 상태 세 필드를 추가한다. 다음 세 함수를 추가한다.

```javascript
const updateNotificationSettings = async ({ enabled, time }) => {
  const result = enabled
    ? await notificationService.enable({ time, lastReadingDate: st.lastReadingDate })
    : (await notificationService.disable(), { enabled: false })
  if (enabled && !result.enabled) {
    patch({ notificationEnabled: false })
    return result
  }
  patch({ notificationEnabled: enabled, notificationTime: time })
  return { enabled }
}

const completeReading = ({ firstReading, usage: nextUsage, reward }) => {
  const lastReadingDate = localDateKey()
  patch({
    recorded: !firstReading,
    usage: nextUsage,
    coins: st.coins + reward,
    screen: 'home',
    camStart: null,
    lastReadingDate,
  })
  if (st.notificationEnabled) {
    void notificationService.refresh({ time: st.notificationTime, lastReadingDate })
  }
}
```

마운트 effect 두 개로 켜진 알림 refresh와 tap listener 등록 및 cleanup을 수행한다. 권한이 이미 거절된 상태라면 로컬 토글도 끄고, 예약 API의 일시적 오류라면 기존 설정을 유지한다.

```javascript
useEffect(() => {
  if (st.notificationEnabled) {
    void notificationService.refresh({
      time: st.notificationTime,
      lastReadingDate: st.lastReadingDate,
    }).then((result) => {
      if (!result.enabled) patch({ notificationEnabled: false })
    }).catch(() => {})
  }
}, [])

useEffect(() => {
  let listener
  void notificationService.listenForActions(() => patch({ screen: 'camera', camStart: 'view' }))
    .then((handle) => { listener = handle })
  return () => { void listener?.remove() }
}, [])
```

`refreshNotificationSettings` 콜백도 같은 `notificationService.refresh`와 권한 거절 처리를 사용한다. `CameraFlow`의 `onDone`은 `completeReading`으로 교체하고 `SettingsScreen`에 `onNotificationChange={updateNotificationSettings}`와 `onNotificationRefresh={refreshNotificationSettings}`를 전달한다.

- [ ] **Step 4: 설정 카드 구현**

`SettingsScreen` props에 `onNotificationChange`와 `onNotificationRefresh`를 추가한다. 화면 진입 effect에서 켜진 알림 예약 창을 refresh한다. 알림 카드에서 토글을 켜면 기본 20:00으로 권한과 예약을 요청하고, 끄면 예약을 취소한다. 시각 변경은 알림이 켜진 경우에만 예약을 교체한다. 요청 중 control을 disable하고 다음 문구를 정확히 사용한다.

```text
검침을 완료한 날에는 알림을 보내지 않아요.
알림 권한이 꺼져 있어요. 다시 허용해 주세요.
알림 시간을 저장하지 못했습니다. 다시 시도해 주세요.
```

권한 재시도는 같은 `onNotificationChange({ enabled: true, time })`를 호출한다. 글자 크기 매핑은 `0.9`, `1`, `1.15`로 바꾼다.

- [ ] **Step 5: GREEN과 빌드 확인**

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs frontend/tests/notifications.test.mjs`

Expected: 두 파일의 모든 테스트가 통과한다.

Run: `npm --prefix frontend run build`

Expected: production build가 성공한다.

- [ ] **Step 6: 브라우저 확인**

Run: `npm --prefix frontend run dev -- --host 127.0.0.1`

브라우저에서 설정 순서, 토글, 시간 입력, 새로고침 후 값 유지, 글자 크게 적용을 확인한다. 웹에서는 시스템 알림을 예약하지 않는 것이 정상이다.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/App.jsx frontend/src/components/SettingsScreen.jsx frontend/tests/pre-capacitor-integration.test.mjs frontend/tests/notifications.test.mjs
git commit -m "feat: 설정에 매일 검침 알림과 글자 크기 개선"
```

---

### Task 5: 설정에 계량기 교체 이력 화면 추가

**Files:**
- Modify: `frontend/src/api.js`
- Create: `frontend/src/components/ReplacementHistoryScreen.jsx`
- Modify: `frontend/src/components/SettingsScreen.jsx`
- Modify: `frontend/tests/pre-capacitor-integration.test.mjs`

- [ ] **Step 1: API와 네 가지 화면 상태의 실패 테스트 작성**

정적 계약 테스트에 `getReplacementHistory()`가 `/history/replacements`를 호출하는지, 설정 카드가 별도 화면을 여는지, 새 화면에 로딩·빈 상태·오류 재시도·정상 목록 문구가 모두 있는지 추가한다.

- [ ] **Step 2: RED 확인**

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs`

Expected: 새 API와 컴포넌트가 없어 실패한다.

- [ ] **Step 3: API 함수와 이력 화면 구현**

`frontend/src/api.js`에 다음 함수를 추가한다.

```javascript
export async function getReplacementHistory() {
  return request('/history/replacements')
}
```

`ReplacementHistoryScreen.jsx`는 마운트 시 API를 호출하고 최신순 목록을 그대로 표시한다. 각 행에는 `교체일`, `이전 마지막 검침`, `새 계량기 기준값`, `사진 인식` 또는 `직접 입력`을 표시한다. `previous_reading_m3 === null`이면 `이전 기록 없음`을 표시한다. API 오류에서만 `다시 시도` 버튼을 표시한다.

- [ ] **Step 4: 설정 화면에서 별도 화면 열기**

`SettingsScreen` 내부에 `showReplacementHistory` 상태를 두고 true일 때 `ReplacementHistoryScreen`을 반환한다. 설정 카드의 `계량기 교체 이력` 버튼으로 열고 화면의 뒤로 버튼으로 닫는다.

- [ ] **Step 5: GREEN과 빌드 확인**

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs`

Expected: 모든 Node 계약 테스트가 통과한다.

Run: `npm --prefix frontend run build`

Expected: production build가 성공한다.

- [ ] **Step 6: 로컬 API 실측**

서버 실행 후 고유한 테스트 기기 ID로 일반 검침, 교체 기준값, 다음 검침을 저장한 뒤 실행한다.

Run: `curl.exe -H "X-Device-ID: settings-plan-replacement" http://127.0.0.1:8000/history/replacements`

Expected: 교체일, 이전값, 기준값, 입력 방식이 한 건 반환된다.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/api.js frontend/src/components/ReplacementHistoryScreen.jsx frontend/src/components/SettingsScreen.jsx frontend/tests/pre-capacitor-integration.test.mjs
git commit -m "feat: 설정에 계량기 교체 이력 화면 추가"
```

---

### Task 6: 설정에 전체 앱 초기화 추가

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/SettingsScreen.jsx`
- Modify: `frontend/tests/pre-capacitor-integration.test.mjs`

- [ ] **Step 1: 서버 우선 삭제 순서와 이중 확인 실패 테스트 작성**

다음 계약을 추가한다.

- `deleteDeviceData()`는 `DELETE /device-data`를 호출하고 204 body를 JSON으로 읽지 않는다.
- 첫 확인은 삭제 범위를 설명하고, 두 번째 확인 버튼 문구는 `모든 데이터 삭제`다.
- `await deleteDeviceData()`가 성공하기 전에는 알림, `banguli_app_v1`, `device_id`를 삭제하지 않는다.
- 실패하면 로컬 데이터가 유지되고 `초기화하지 못했습니다. 다시 시도해 주세요.`가 표시된다.

- [ ] **Step 2: RED 확인**

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs`

Expected: 초기화 API와 UI가 없어 실패한다.

- [ ] **Step 3: 204를 지원하는 API 클라이언트 구현**

`request()`는 `res.status === 204`일 때 `null`을 반환하도록 한 줄 분기하고 다음 함수를 추가한다.

```javascript
export async function deleteDeviceData() {
  return request('/device-data', { method: 'DELETE' })
}
```

- [ ] **Step 4: 서버 성공 뒤 로컬 전체 초기화 구현**

`App.jsx`에서 `deleteDeviceData`를 import하고 다음 순서를 유지한다.

```javascript
const resetApplication = async () => {
  await deleteDeviceData()
  await notificationService.disable()
  localStorage.removeItem(STORE_KEY)
  localStorage.removeItem('device_id')
  setShowAttend(false)
  setSt({ ...DEFAULT_STATE })
}
```

알림 취소가 실패하면 로컬 상태를 지우지 않는다. 사용자는 멱등적인 서버 삭제를 포함해 다시 시도할 수 있다.

- [ ] **Step 5: 위험 카드와 이중 확인 UI 구현**

설정 맨 아래에 기존 `처음부터 보기`와 구분된 `앱 초기화` 카드를 둔다. 첫 단계에서 서버 검침·교체 이력·지역 설정과 로컬 이름·코인·아이템·알림 설정이 삭제됨을 설명한다. 두 번째 단계에서 `취소`와 붉은색 `모든 데이터 삭제`를 표시한다. 처리 중 중복 클릭을 막고 실패 시 모달을 유지한다.

- [ ] **Step 6: GREEN과 전체 프론트 검증**

Run: `node --test frontend/tests/*.test.mjs`

Expected: 전체 Node 테스트가 통과한다.

Run: `npm --prefix frontend run build`

Expected: production build가 성공한다.

- [ ] **Step 7: 로컬 API 실측**

초기화 전 고유 기기 ID로 검침과 지역을 만든 뒤 실행한다.

Run: `curl.exe -i -X DELETE -H "X-Device-ID: settings-plan-reset" http://127.0.0.1:8000/device-data`

Expected: `HTTP/1.1 204 No Content`다.

Run: `curl.exe -H "X-Device-ID: settings-plan-reset" http://127.0.0.1:8000/history`

Expected: `[]`다.

- [ ] **Step 8: 커밋**

```bash
git add frontend/src/api.js frontend/src/App.jsx frontend/src/components/SettingsScreen.jsx frontend/tests/pre-capacitor-integration.test.mjs
git commit -m "feat: 설정에 전체 앱 초기화 추가"
```

---

### Task 7: 전체 검증, 문서 기록, 배포와 Android 체크포인트

**Files:**
- Modify: `checklist.md`
- Modify: `context-notes.md`
- Modify if measured behavior differs: `docs/superpowers/specs/2026-07-16-settings-notifications-reset-design.md`

- [ ] **Step 1: fresh 전체 자동 검증**

Run: `uv run pytest -q`

Expected: 전체 pytest가 통과한다.

Run: `node --test frontend/tests/*.test.mjs`

Expected: 전체 Node 테스트가 통과한다.

Run: `npm --prefix frontend run build`

Expected: Vite production build가 성공한다.

Run: `git diff --check`

Expected: 출력 없이 종료 코드 0이다.

- [ ] **Step 2: 로컬 웹 E2E**

다음을 실제 UI에서 확인한다.

- 알림 기본값은 꺼짐과 20:00이다.
- 알림 켜기, 시각 변경, 끄기 후 새로고침해도 설정이 유지된다.
- 글자 크게가 이전보다 분명히 크고 레이아웃이 잘리지 않는다.
- 교체 이력의 로딩, 빈 상태, 정상 목록, API 오류 재시도가 보인다.
- 전체 초기화 첫 확인과 두 번째 확인이 구분된다.
- 서버 실패를 만들어 초기화를 시도하면 로컬 이름과 기기 ID가 유지된다.
- 성공 초기화는 온보딩과 지역 선택부터 다시 시작한다.

- [ ] **Step 3: 자체 리뷰**

`git diff`와 새 테스트를 대조해 설계 범위 밖 변경, 다른 기기 삭제 가능성, 서버 성공 전 로컬 삭제, 방울이 이외 알림 취소, 계정 기능 추가가 없는지 확인한다.

- [ ] **Step 4: 진행 기록 갱신**

`checklist.md`에 이 계획의 태스크별 완료 상태를 반영하고 `context-notes.md`에 다음 실측 결과를 기록한다.

- 실제 테스트 개수와 build 결과.
- 웹에서 시스템 알림이 no-op임을 확인한 결과.
- 60일 예약 창과 exact alarm 제외 결정.
- Android 실기기 검증이 기존 Task 9로 남아 있다는 사실.

- [ ] **Step 5: 기록 커밋**

추적 중인 문서만 stage한다. 현재 untracked인 `checklist.md`와 `context-notes.md`를 이 커밋에 포함할지는 기존 저장소 정책을 확인한 뒤 결정한다.

```bash
git add docs/superpowers/specs/2026-07-16-settings-notifications-reset-design.md
git commit -m "docs: 설정 확장 검증 결과 기록"
```

설계 문서 변경이 없으면 빈 커밋을 만들지 않고 이 단계는 다음 배포 커밋 기록에 합친다.

- [ ] **Step 6: 브랜치 푸시와 EC2 배포**

Run: `git push origin feature_app_merge`

기존 EC2 배포 절차로 새 커밋을 fast-forward하고, 새 commit SHA 태그로 Docker 이미지를 빌드해 기존 `weights`, `data`, `unless-stopped` 설정을 유지한 채 컨테이너를 교체한다.

Run: `curl.exe http://13.53.120.64:8000/health`

Expected: `{"status":"ok"}`다.

고유 테스트 기기 ID로 `/history/replacements`와 `/device-data`도 운영 환경에서 실측한다. 운영 실측용 데이터는 마지막에 삭제한다.

- [ ] **Step 7: Android Task 9 사용자 체크포인트에서 실기기 E2E**

사용자에게 appId 확정과 Android 실기기 연결을 요청한 뒤 `npx cap sync android`를 실행한다. 다음을 실제 기기에서 확인하기 전에는 Android 알림 완료를 선언하지 않는다.

- Android 알림 권한 허용과 거절.
- 현재 시각에서 몇 분 뒤로 설정한 알림 수신.
- 알림 탭 시 검침 촬영 화면 이동.
- 오늘 검침 성공 뒤 오늘 예약 취소와 내일부터 재예약.
- 알림 시각 변경과 알림 해제.
- 앱 재실행 뒤 60일 예약 refresh.

실측이 설계와 다르면 정확한 로그를 기록하고 세 번 이내에서 수정하며, manifest에 exact alarm 권한을 임의로 추가하지 않는다.

---

## 완료 기준

- 백엔드와 프론트 자동 테스트 및 production build가 fresh 실행에서 통과한다.
- 교체 이력과 초기화가 `X-Device-ID` 기준으로 다른 기기에 영향을 주지 않는다.
- 알림 권한 거절과 예약 오류가 기존 설정을 파괴하지 않는다.
- 검침 성공 당일 알림은 건너뛰고, 이후 60일을 다시 채운다.
- 전체 초기화는 서버 성공 전 로컬 데이터를 지우지 않는다.
- 웹 검증과 EC2 검증을 마치고, Android 항목은 Task 9 실기기 결과로 최종 닫는다.
