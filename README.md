<p align="center">
  <img src="frontend/public/img/base_happy2.png" width="180" alt="방울이">
</p>

<h1 align="center">방울이</h1>

<p align="center">
  수도 계량기 사진을 인식하고 사용량·요금·환경 영향을 알려주는 스마트 수도 계량기 앱
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white" alt="Python 3.12">
  <img src="https://img.shields.io/badge/FastAPI-API-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=20232A" alt="React 19">
  <img src="https://img.shields.io/badge/Capacitor-8-119EFF?logo=capacitor&logoColor=white" alt="Capacitor 8">
</p>

## 주요 기능

- 계량기 사진 촬영과 YOLOX 기반 검침값 인식.
- 인식 실패 시 수동 입력과 계량기 교체 기준점 처리.
- 지역별 수도 요금, 사용량과 환경 영향 계산.
- 주간·월간·연간 리포트와 검침·교체 이력 조회.
- 매일 검침 알림, 글자 크기와 현재 기기 데이터 초기화 설정.
- 나무코인으로 방울이 옷과 방을 꾸미는 리워드 UI.

## 기술 구성

| 영역 | 구성 | 역할 |
|---|---|---|
| Backend | Python 3.12, FastAPI, SQLModel, SQLite | 검침, 이력, 지역 설정과 요금 계산 API |
| Model | YOLOX, OpenCV | 수도 계량기 숫자 인식 |
| Frontend | React 19, Vite 8 | 모바일 중심 웹 UI와 API 연동 |
| Mobile | Capacitor 8, Android | 카메라와 로컬 알림을 사용하는 앱 컨테이너 |
| Operation | Docker, AWS EC2 | 운영 API 실행과 데이터·가중치 영속화 |

## 빠른 시작

### 백엔드

```powershell
uv sync
uv run uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
```

Swagger UI는 `http://localhost:8000/docs`에서 확인한다.

### 프론트엔드

Node.js 22 이상을 사용한다.

```powershell
cd frontend
npm install
npm run dev
```

Vite 개발 서버는 기본적으로 `http://localhost:5173`에서 실행된다. 자세한 환경변수, 테스트와 Android 빌드 방법은 [프론트엔드 안내](frontend/README.md)를 참고한다.

## 저장소 구조

```text
src/                    FastAPI, YOLOX 추론, 17개 지역 요금 계산
tests/                  Python API·도메인 테스트
frontend/               React UI, Node 테스트, Capacitor Android
data/                   로컬 SQLite 데이터, Git 제외
weights/                로컬 모델 가중치
docs/                   프론트 인수인계, API와 EC2 배포 문서
output/                 팀 확인용 빌드 산출물 안내
```

`data/data.db`에는 로컬 실행 중 생성한 검침 이력과 지역 설정이 저장된다. 이 폴더는 Git에 포함되지 않으며 EC2 운영 서버의 데이터와 별개다. 삭제하면 다음 실행 때 빈 DB가 다시 생성되지만 기존 로컬 이력은 사라진다.

## 테스트

```powershell
# 저장소 루트
uv run pytest

# frontend
cd frontend
node --test
npm run build
```

## 모바일 앱

Android 앱 ID는 `com.jjang.banguli`다. 현재 Debug APK는 에뮬레이터 기본 흐름까지 검증됐으며 실제 기기의 카메라·알림 E2E는 남아 있다.

- [프론트엔드와 Capacitor 개발 안내](frontend/README.md).
- [빌드 산출물 안내](output/README.md).
- [Android 테스트 APK 상세](output/android/README.md).

iOS는 현재 빌드 산출물이 없다. 기존 React UI를 재사용할 수 있지만 Mac, Xcode, HTTPS API와 iPhone 실기기 검증이 필요하다.

## 문서

- [프론트엔드 연동 인수인계](docs/frontend-integration-handoff.md).
- [프론트엔드 연동 인수인계 PDF](docs/banguli-frontend-integration.pdf).
- [API 사용 가이드](docs/api-guide.md).
- [EC2 Docker 배포 가이드](docs/deployment-guide.md).

운영 API는 EC2 Docker에서 `http://13.53.120.64:8000`으로 실행된다. 배포·업데이트·로그·복구 절차는 EC2 배포 가이드를 따른다.

## 팀원

<table>
  <tr>
    <td align="center" width="160">
      <a href="https://github.com/jaeheonki">
        <img src="https://github.com/jaeheonki.png?size=100" width="100" alt="김재헌"><br>
        <sub><b>김재헌 (PM)</b></sub>
      </a>
    </td>
    <td align="center" width="160"><br><sub><b>정승호</b></sub></td>
    <td align="center" width="160"><br><sub><b>노승원</b></sub></td>
    <td align="center" width="160"><br><sub><b>유수빈</b></sub></td>
  </tr>
</table>
