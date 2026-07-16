# smart-water-meter-kr

수도 계량기 사진에서 검침값을 인식하고 사용량·요금·환경 영향을 계산하는 방울이 앱이다. FastAPI 백엔드와 Vite React 프론트, Capacitor Android 프로젝트로 구성된다.

## 구조

```text
src/                    FastAPI, YOLOX 추론, 17개 지역 요금 계산
tests/                  Python API·도메인 테스트
frontend/               React UI, Node 테스트, Capacitor Android
docs/                   프론트 인수인계 PDF, API, EC2 배포 가이드
output/android/         팀 확인용 Debug APK 안내와 로컬 APK
```

구현 연결 흐름과 현재 검증 상태는 [프론트엔드 연동 인수인계](docs/frontend-integration-handoff.md)를 먼저 확인한다.

## 백엔드 로컬 실행

```powershell
uv sync
uv run uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
```

Swagger UI는 `http://localhost:8000/docs`다.

## 프론트 로컬 실행

Node.js 22 이상을 사용한다.

```powershell
cd frontend
npm install
npm run dev
```

Vite는 기본적으로 `http://localhost:5173`에서 실행된다. 개발 API 주소는 `frontend/.env.development`, 운영 API 주소는 `frontend/.env.production`의 `VITE_API_BASE_URL`을 사용한다.

## Android Debug APK 빌드

Capacitor 8, Android Studio 2025.2.1 이상, Android Studio 내장 JDK 21과 Android SDK 36을 사용한다.

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

Gradle APK는 `frontend/android/app/build/outputs/apk/debug/app-debug.apk`에 생성된다. 팀 확인용 APK와 설치 방법은 [Android 전달물 안내](output/android/README.md)를 참고한다.

## 테스트

```powershell
# 저장소 루트
uv run pytest

# frontend
node --test
npm run build
```

## 문서

- [프론트엔드 연동 인수인계](docs/frontend-integration-handoff.md).
- [API 사용 가이드](docs/api-guide.md).
- [EC2 Docker 배포 가이드](docs/deployment-guide.md).
- `docs/banguli-frontend-integration.pdf`.

## 운영 API

운영 API는 EC2 Docker에서 `http://13.53.120.64:8000`으로 실행된다. 배포·업데이트·로그·재부팅 후 복구 절차는 [EC2 Docker 배포 가이드](docs/deployment-guide.md)를 따른다.
