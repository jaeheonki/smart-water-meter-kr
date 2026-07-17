# 인앱 카메라 미리보기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android 시스템 카메라 전환을 제거하고 방울이 촬영 화면 안에서 후면 카메라 미리보기, 촬영과 플래시 토글을 제공한다.

**Architecture:** Camera Preview 플러그인을 `camera.js`의 상태형 컨트롤러로 감싸 네이티브 기능과 React 화면을 분리한다. `CameraFlow`는 컨트롤러의 시작·촬영·플래시·정지만 호출하고, 기존 갤러리 및 웹 입력과 서버 스캔 흐름은 유지한다.

**Tech Stack:** React 19, Capacitor 8, `@capacitor-community/camera-preview` 8.0.1, Node 내장 테스트 러너, Vite, Android Gradle.

## Global Constraints

- 플래시는 기본 꺼짐이며 사용자가 눌렀을 때만 `torch`로 전환한다.
- 자동 플래시, 줌, 전면 카메라, 동영상과 iOS 프로젝트는 추가하지 않는다.
- 백엔드 API와 YOLOX 모델 코드는 변경하지 않는다.
- 갤러리 선택과 웹 파일 입력 폴백은 유지한다.

---

### Task 1: Camera Preview 의존성과 Android 권한 추가

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/android/app/src/main/AndroidManifest.xml`
- Test: `frontend/tests/pre-capacitor-integration.test.mjs`

**Interfaces:**
- Produces: `@capacitor-community/camera-preview` 8.0.1과 Android `CAMERA` 권한.

- [ ] **Step 1: Capacitor 8 호환 플러그인을 설치한다**

Run: `npm install @capacitor-community/camera-preview@8.0.1`

Expected: package와 lock 파일에 8.0.1 의존성이 추가된다.

- [ ] **Step 2: Android 카메라 권한 계약 테스트를 작성하고 RED를 확인한다**

```javascript
const androidManifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')

test('Android 인앱 미리보기는 CAMERA 권한과 Camera Preview 플러그인을 등록한다', () => {
  assert.match(androidManifest, /<uses-permission android:name="android.permission.CAMERA"\s*\/>/)
  assert.equal(packageJson.dependencies['@capacitor-community/camera-preview'], '^8.0.1')
})
```

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs`

Expected: `CAMERA` 권한 누락으로 실패한다.

- [ ] **Step 3: AndroidManifest에 CAMERA 권한을 추가하고 GREEN을 확인한다**

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs`

Expected: 권한 계약 테스트가 통과한다.

---

### Task 2: 네이티브 미리보기 컨트롤러 구현

**Files:**
- Modify: `frontend/src/camera.js`
- Create: `frontend/tests/camera-preview.test.mjs`

**Interfaces:**
- Produces: `createCameraPreviewController({ preview, isNative })`, `cameraPreviewController`.
- Controller methods: `isAvailable()`, `start(parent)`, `capture()`, `toggleFlash()`, `stop()`.
- `start()` returns `{ started: boolean, flashSupported: boolean }`.
- `toggleFlash()` returns `{ flashOn: boolean }`.
- `capture()` returns a JPEG `File` named `meter.jpg`.

- [ ] **Step 1: 가짜 플러그인으로 컨트롤러 계약 RED 테스트를 작성한다**

```javascript
test('네이티브 미리보기는 후면 카메라를 시작하고 촬영과 torch를 제어한 뒤 정리한다', async () => {
  const calls = []
  const preview = {
    start: async (options) => calls.push(['start', options]),
    getSupportedFlashModes: async () => ({ result: ['off', 'torch'] }),
    setFlashMode: async (options) => calls.push(['flash', options]),
    capture: async () => ({ value: 'aGVsbG8=' }),
    stop: async () => calls.push(['stop']),
  }
  const controller = createCameraPreviewController({ preview, isNative: () => true })

  assert.deepEqual(await controller.start('meter-camera-preview'), { started: true, flashSupported: true })
  assert.deepEqual(await controller.toggleFlash(), { flashOn: true })
  assert.equal((await controller.capture()).name, 'meter.jpg')
  await controller.stop()
  assert.deepEqual(calls.at(-2), ['flash', { flashMode: 'off' }])
  assert.deepEqual(calls.at(-1), ['stop'])
})
```

Run: `node --test frontend/tests/camera-preview.test.mjs`

Expected: 컨트롤러 export가 없어 실패한다.

- [ ] **Step 2: 최소 컨트롤러를 구현한다**

컨트롤러는 `CameraPreview.start({ parent, position: 'rear', toBack: true, disableAudio: true })`, `capture({ quality: 90 })`, `getSupportedFlashModes()`, `setFlashMode({ flashMode: 'torch' | 'off' })`, `stop()`을 호출한다. Base64 촬영값은 JPEG `File`로 변환한다.

- [ ] **Step 3: 컨트롤러 테스트를 GREEN으로 전환한다**

Run: `node --test frontend/tests/camera-preview.test.mjs`

Expected: 네이티브 시작·촬영·플래시·정리와 비네이티브 no-op 테스트가 모두 통과한다.

---

### Task 3: CameraFlow를 실제 미리보기와 연결

**Files:**
- Modify: `frontend/src/components/CameraFlow.jsx`
- Modify: `frontend/src/App.css`
- Modify: `frontend/tests/pre-capacitor-integration.test.mjs`

**Interfaces:**
- Consumes: Task 2의 `cameraPreviewController`.
- Preserves: `getPhoto('photos')`, `scanMeter(file)`, 직접 입력과 취소 흐름.

- [ ] **Step 1: 화면 수명 주기와 플래시 UI 계약 RED 테스트를 작성한다**

테스트는 다음 계약을 검증한다.

```javascript
assert.match(cameraFlow, /cameraPreviewController\.start\(['"]meter-camera-preview['"]\)/)
assert.match(cameraFlow, /cameraPreviewController\.capture\(\)/)
assert.match(cameraFlow, /cameraPreviewController\.toggleFlash\(\)/)
assert.match(cameraFlow, /cameraPreviewController\.stop\(\)/)
assert.match(cameraFlow, /id=['"]meter-camera-preview['"]/)
assert.match(styles, /body\.camera-preview-active/)
```

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs`

Expected: 미리보기 수명 주기 연결이 없어 실패한다.

- [ ] **Step 2: 촬영 화면 진입과 종료 수명 주기를 연결한다**

- `step === 'view'`인 네이티브 환경에서 미리보기를 시작한다.
- 촬영, 직접 입력, 갤러리, 닫기와 컴포넌트 해제 시 미리보기를 정지한다.
- 미리보기 활성 중에만 `body.camera-preview-active`를 적용한다.
- 시작 실패는 화면 오류로 표시하되 갤러리와 직접 입력을 유지한다.

- [ ] **Step 3: 촬영과 플래시 버튼을 컨트롤러에 연결한다**

- 네이티브 촬영은 `cameraPreviewController.capture()` 결과를 기존 `scanMeter()`에 전달한다.
- 플래시 버튼은 지원 기기에서만 활성화하고 `off`와 `torch`를 토글한다.
- 웹 촬영은 기존 `getPhoto('camera')` 폴백을 유지한다.
- 네이티브 뷰파인더에서는 예시 `MeterFace`를 숨기고 실제 영상 위 정렬 테두리만 표시한다.

- [ ] **Step 4: 전체 자동 검증과 APK 빌드를 실행한다**

Run: `node --test frontend/tests/camera-preview.test.mjs frontend/tests/notifications.test.mjs frontend/tests/pre-capacitor-integration.test.mjs frontend/tests/task7-integration.test.mjs`

Expected: 전체 Node 테스트가 통과한다.

Run: `npm run build`

Expected: Vite 빌드가 종료 코드 0으로 통과한다.

Run: `npx cap sync android`

Expected: Camera Preview 플러그인이 Android에 등록된다.

Run: `./gradlew.bat assembleDebug`

Expected: Debug APK 빌드가 통과한다.

- [ ] **Step 5: 변경을 의미 단위로 커밋한다**

```bash
git add frontend/package.json frontend/package-lock.json frontend/android/app/src/main/AndroidManifest.xml
git commit -m "build: 인앱 카메라 미리보기 플러그인 추가"

git add frontend/src/camera.js frontend/src/components/CameraFlow.jsx frontend/src/App.css frontend/tests
git commit -m "feat: 앱 내 계량기 촬영과 플래시 제어 추가"
```

---

### Task 4: Android 실기기 확인

**Files:**
- Update: `output/android/banguli-debug.apk`
- Modify: `output/android/README.md`

**Interfaces:**
- Produces: 실기기 확인용 최신 Debug APK.

- [ ] **Step 1: 새 APK를 전달 경로에 복사하고 해시를 기록한다**

원본 `frontend/android/app/build/outputs/apk/debug/app-debug.apk`를 `output/android/banguli-debug.apk`로 복사하고 두 파일의 SHA-256 일치를 확인한다.

- [ ] **Step 2: 사용자를 실기기 확인 지점으로 부른다**

확인 항목은 앱 내부 후면 카메라 영상, 화면 내 촬영, 플래시 토글, 갤러리 취소 후 미리보기 복귀다.
