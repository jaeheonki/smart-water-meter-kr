# 방울이 Android 테스트 APK

[산출물 공통 정책](../README.md)에서 바이너리 보관과 공유 기준을 먼저 확인한다.

## 전달 파일

| 항목 | 값 |
|---|---|
| 파일 | `output/android/banguli-debug.apk` |
| appId | `com.jjang.banguli` |
| 버전 | `1.0` (`versionCode` 1) |
| 빌드 유형 | Debug |
| 최소 Android SDK | 24 |
| 대상 Android SDK | 36 |
| 파일 크기 | 85,420,968 bytes |
| SHA-256 | `4D9106E7DCE15782CCD139949917C53044B033C57AD958BDA14B5BCC0261A2E8` |
| 생성 시각 | 2026-07-17 KST |

이 파일은 현재 작업 공간에서 팀 테스트용으로 복사한 전달물이다.

## 설치

Android 기기에서 개발자 옵션과 USB 디버깅을 켠 뒤 저장소 루트에서 실행한다.

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r `
  output\android\banguli-debug.apk
```

신규 설치 상태를 다시 확인하려면 기존 앱 데이터를 삭제하거나 앱을 제거한 뒤 설치한다.

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell pm clear com.jjang.banguli
```

## 빌드 재현

```powershell
cd frontend
npm run build
npx cap sync android

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

cd android
.\gradlew.bat assembleDebug
```

Gradle 원본은 `frontend/android/app/build/outputs/apk/debug/app-debug.apk`에 생성된다.

## 확인된 항목

- Vite 운영 번들과 Capacitor Android 동기화 성공.
- Camera Preview 8.0.1, Camera 8.2.1과 Local Notifications 8.0.0 플러그인 등록.
- Gradle `assembleDebug` 성공.
- package `com.jjang.banguli`, minSdk 24, targetSdk 36 확인.
- 에뮬레이터 신규 상태에서 코인 0 확인.
- 에뮬레이터에서 온보딩, 서울 지역 운영 API 저장과 홈 진입 확인.
- 앱 WebView에서 운영 HTTP API 연결 확인.

## 남은 실기기 확인

- 앱 내부 후면 카메라 미리보기와 화면 내 촬영.
- 플래시 off·torch 전환과 화면 이탈 시 카메라 종료.
- 갤러리 취소 후 앱 내부 미리보기 복귀.
- 모델 인식값 확인과 수동 입력 폴백.
- 알림 권한 허용·거부, 지정 시각 수신과 알림 탭 후 검침 화면 이동.
- 앱 재실행 후 같은 `device_id`와 검침 이력 유지.

따라서 이 APK는 에뮬레이터 기본 흐름까지 검증한 Debug 테스트 빌드다. Android 실기기 E2E 완료본이나 스토어 배포용 서명 APK로 표시하면 안 된다.
