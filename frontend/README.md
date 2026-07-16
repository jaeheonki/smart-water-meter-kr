# 방울이 프론트엔드

React와 Vite로 구성한 모바일 중심 UI다. 웹에서는 FastAPI와 직접 통신하고, Android에서는 Capacitor WebView와 네이티브 플러그인을 통해 카메라와 로컬 알림을 사용한다.

## 구성

```text
frontend/
├─ public/img/           방울이, 의상, 방 테마와 소품 이미지
├─ src/
│  ├─ components/       온보딩, 홈, 검침, 리포트, 설정 화면
│  ├─ api.js            FastAPI 요청 클라이언트
│  ├─ camera.js         웹·네이티브 사진 획득 어댑터
│  ├─ notifications.js  Capacitor 로컬 알림 어댑터
│  ├─ reportData.js     이력 기반 리포트 기간·합계 계산
│  └─ App.jsx           화면 상태와 전체 흐름 조립
├─ tests/                Node 계약·통합 테스트
├─ android/              Capacitor Android 프로젝트
├─ capacitor.config.json
└─ package.json
```

## API 환경변수

| 환경 | 파일 | 기본 주소 |
|---|---|---|
| 개발 | `.env.development` | `http://localhost:8000` |
| 운영 빌드 | `.env.production` | `http://13.53.120.64:8000` |

Vite가 `VITE_API_BASE_URL`을 읽고 `src/api.js`가 모든 API 요청에 사용한다. 운영 주소나 프로토콜을 바꾸면 환경변수를 수정한 뒤 프론트를 다시 빌드하고 Capacitor를 동기화해야 한다.

## 웹 실행

Node.js 22 이상을 사용한다.

```powershell
cd frontend
npm install
npm run dev
```

백엔드를 `http://localhost:8000`에서 함께 실행하면 온보딩, 검침, 이력, 리포트와 설정을 웹에서 확인할 수 있다.

## 테스트와 프로덕션 빌드

```powershell
cd frontend
node --test
npm run build
```

프로덕션 번들은 `frontend/dist/`에 생성된다. 이 폴더는 재생성 가능한 빌드 결과이므로 Git에 커밋하지 않는다.

## Android

필요한 도구는 Capacitor 8, Android Studio 2025.2.1 이상, Android Studio 내장 JDK 21과 Android SDK 36이다.

```powershell
cd frontend
npm install
npm run build
npx cap sync android

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

cd android
.\gradlew.bat assembleDebug
```

Debug APK는 `frontend/android/app/build/outputs/apk/debug/app-debug.apk`에 생성된다. 설치 가능한 전달본과 검증 범위는 [Android APK 상세](../output/android/README.md)를 참고한다.

### 네이티브 플러그인

| 패키지 | 역할 | 현재 상태 |
|---|---|---|
| `@capacitor/camera` | 실제 카메라 촬영과 웹 파일 선택 | Android 등록 완료, 실기기 촬영 미검증 |
| `@capacitor/local-notifications` | 검침 알림 예약·취소와 알림 탭 이동 | Android 등록 완료, 실기기 수신 미검증 |

현재 Android 설정은 운영 HTTP API 연결을 위해 cleartext를 허용한다. 배포 보안을 위해 운영 API를 HTTPS로 전환하는 것이 후속 과제다.

## iOS 확장

React 화면, API 클라이언트와 Capacitor 플러그인 호출은 iOS에서도 재사용할 수 있다. 다만 현재 iOS 프로젝트와 배포 산출물은 없으며 다음 조건이 필요하다.

- macOS와 Xcode 26 이상.
- `@capacitor/ios` 설치와 `npx cap add ios` 실행.
- 카메라 사용 설명과 알림 권한 설정.
- ATS 정책을 만족하는 HTTPS 운영 API.
- iPhone 실기기 E2E와 Apple 서명·TestFlight 검증.

## 관련 문서

- [프로젝트 전체 안내](../README.md).
- [프론트엔드 연동 인수인계](../docs/frontend-integration-handoff.md).
- [API 사용 가이드](../docs/api-guide.md).
- [빌드 산출물 안내](../output/README.md).
