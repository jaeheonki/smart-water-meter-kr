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
| 파일 크기 | 90,763,539 bytes |
| SHA-256 | `FE030BA8E494362B6FADD8120E9F4490DDA3834795D9AE37980405A1D7459503` |
| 생성 시각 | 2026-07-20 KST |

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
- 가계부의 UTC 검침 시각을 서울 날짜로 표시하고 직접 입력·사진 확인 화면에 실제 이전 검침을 안내.
- package `com.jjang.banguli`, minSdk 24, targetSdk 36 확인.
- 에뮬레이터 신규 상태에서 코인 0 확인.
- 에뮬레이터에서 온보딩, 서울 지역 운영 API 저장과 홈 진입 확인.
- 앱 WebView에서 운영 HTTP API 연결 확인.
- 선택한 사진의 인식 중 미리보기, 12초 제한과 같은 사진 재시도 UI 포함.
- 하루 한 번만 신규 검침을 등록하고, 이후에는 홈의 `오늘 기록 수정`으로 같은 행만 수정.
- 오늘 검침 후 중앙 버튼 잠금과 수정 완료 안내 화면을 에뮬레이터에서 확인.
- Material Symbols 아이콘 폰트를 APK 내부 자산으로 포함.
- 에뮬레이터에서 리포트 탭 상태로 완전 종료 후 런처 재실행 시 홈 화면 복귀 확인.
- Galaxy 실기기에서 앱 실행, 카메라 촬영, YOLOX 인식과 직접 수정 흐름 확인.
- Galaxy 실기기에서 하루 한 번 신규 저장과 당일 기록 수정 확인.
- Galaxy 실기기에서 기록 날짜가 물 가계부와 에너지 리포트에 반영되는 흐름 확인.
- Galaxy 실기기에서 앱 완전 종료 후 홈 화면으로 재실행되는 흐름 확인.

## 배포 전 추가 점검

- 릴리스 서명 APK 또는 AAB 생성.
- Android 버전과 제조사가 다른 기기에서 카메라·알림 호환성 확인.
- HTTPS 운영 API 전환 후 네트워크 보안 설정 재검증.

따라서 이 APK는 에뮬레이터와 Galaxy 실기기 핵심 E2E를 검증한 Debug 테스트 빌드다. 스토어 배포용 서명 APK는 아니다.
