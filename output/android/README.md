# 방울이 Android 테스트 APK

## 전달 파일

| 항목 | 값 |
|---|---|
| 파일 | `output/android/banguli-debug.apk` |
| appId | `com.jjang.banguli` |
| 버전 | `1.0` (`versionCode` 1) |
| 빌드 유형 | Debug |
| 최소 Android SDK | 24 |
| 대상 Android SDK | 36 |
| 파일 크기 | 80,989,289 bytes |
| SHA-256 | `01739A583EDD26A1C4BC43720BFB6095B608AD9B308E555B0839F2CE36517DD5` |
| 생성 시각 | 2026-07-17 01:38:46 KST |

APK는 Git 저장소에 커밋하지 않는다. 이 파일은 현재 작업 공간에서 팀 테스트용으로 복사한 전달물이며, 실기기 검증을 마친 뒤 공유할 때는 GitHub Release 첨부 파일을 사용한다.

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
- Camera 8.2.1과 Local Notifications 8.0.0 플러그인 등록.
- Gradle `assembleDebug` 성공.
- package `com.jjang.banguli`, minSdk 24, targetSdk 36 확인.
- 에뮬레이터 신규 상태에서 코인 0 확인.
- 에뮬레이터에서 온보딩, 서울 지역 운영 API 저장과 홈 진입 확인.
- 앱 WebView에서 운영 HTTP API 연결 확인.

## 남은 실기기 확인

- 시스템 카메라 권한과 실제 계량기 촬영.
- 모델 인식값 확인과 수동 입력 폴백.
- 알림 권한 허용·거부, 지정 시각 수신과 알림 탭 후 검침 화면 이동.
- 앱 재실행 후 같은 `device_id`와 검침 이력 유지.

따라서 이 APK는 에뮬레이터 기본 흐름까지 검증한 Debug 테스트 빌드다. Android 실기기 E2E 완료본이나 스토어 배포용 서명 APK로 표시하면 안 된다.
