# 방울이 프론트엔드 연동 인수인계

작성일 2026-07-17  
대상 브랜치 `feature_app_merge`

## 1. 목적

복구된 React UI가 백엔드 API, 모델 인식, 로컬 알림, Capacitor Android, AWS 운영 환경에 연결된 흐름을 팀원이 빠르게 파악할 수 있는 단일 인수인계 문서와 PDF를 만든다.

이번 문서는 프론트엔드 연결 흐름을 중심으로 한다. 백엔드 계산식과 모델 내부 구조는 API 접점까지만 설명한다. AWS는 프론트의 운영 API 연결과 팀원이 서버를 재배포·검증하는 데 필요한 범위까지 포함한다.

## 2. 목표 저장소 구조

```text
smart_water_meter/
├─ src/                         # Python 백엔드
├─ tests/                       # 백엔드 테스트
├─ frontend/                    # React + Capacitor Android
├─ docs/
│  ├─ frontend-integration-handoff.md
│  ├─ api-guide.md
│  └─ deployment-guide.md
├─ output/
│  ├─ android/
│  │  ├─ README.md
│  │  └─ banguli-debug.apk
│  └─ pdf/
│     └─ banguli-frontend-integration.pdf
├─ Dockerfile
├─ pyproject.toml
├─ uv.lock
└─ README.md
```

`src/`와 `tests/`를 별도 `backend/` 폴더로 옮기지 않는다. 머지 직전에 Python import, Docker 빌드 컨텍스트와 배포 명령을 불필요하게 바꾸지 않기 위한 결정이다. 이번 정리는 기능 경계를 재설계하는 작업이 아니라 중복·임시 파일을 걷어내고 팀 전달물을 명확한 위치에 두는 작업이다.

- `docs/frontend-integration-handoff.md`는 PDF의 원본이자 팀원이 GitHub에서 바로 읽는 문서다.
- `output/pdf/banguli-frontend-integration.pdf`는 흐름도와 실행 절차를 포함한 배포 가능한 문서다.
- `output/android/banguli-debug.apk`는 로컬 전달용 Debug APK다. Git 이력에는 포함하지 않는다.
- `output/android/README.md`는 APK의 생성 경로, appId, 해시, 설치 방법과 검증 상태를 기록한다.
- APK를 팀에 배포할 때는 저장소 커밋 대신 GitHub Release 첨부 파일을 사용한다.

## 3. 문서 구성

### 3.1 UI 복구와 화면 구성

- 공유 HTML 번들에서 원본 JSX를 복구한 배경.
- Vite React 프로젝트로 이식하고 Android 데모 프레임을 제거한 방식.
- 온보딩, 홈, 사진 검침, 물 가계부, 에너지 리포트, 상점, 설정 화면의 구성.
- 별도 PNG 103개를 `frontend/public/img`에 복구한 이유와 사용 방식.

### 3.2 프론트엔드 연결 설계

- 화면 컴포넌트가 `App.jsx`를 통해 전환되고 상태를 공유하는 구조.
- localStorage가 온보딩, 코인, 글자 크기, 알림 설정과 기기 UUID를 보존하는 범위.
- 화면에서 직접 `fetch`하지 않고 `api.js`를 거치는 경계.
- `camera.js`, `notifications.js`, `reportData.js`의 책임.
- 개발과 운영 API 주소를 Vite 환경변수로 분리한 방식.

### 3.3 주요 기능 흐름

다음 여섯 흐름을 각각 번호형 다이어그램과 관련 파일·API 표로 설명한다.

1. 최초 실행과 지역 설정.
2. 사진 검침, 모델 인식, 사용자 확인, 수동 입력 폴백과 저장.
3. 감소 검침과 계량기 교체 기준점 처리.
4. 검침 이력과 에너지 리포트 기간 비교.
5. 알림, 교체 이력, 글자 크기와 전체 앱 초기화.
6. Vite 운영 빌드, Capacitor 동기화, APK 생성과 AWS API 연결.

각 흐름은 화면, 프론트 어댑터, 네이티브 플러그인, FastAPI 접점의 순서로 읽히게 구성한다. 한 다이어그램에 모든 화살표를 넣지 않고 기능별로 분리해 교차선을 없앤다.

### 3.4 Capacitor Android

- 확정 appId `com.jjang.banguli`.
- Vite `dist`를 Android WebView에 포함하는 과정.
- Camera와 Local Notifications 플러그인의 웹·네이티브 분기.
- 현재 HTTP 운영 API를 위한 cleartext 설정.
- Android Studio 내장 JDK 21, SDK 36과 Debug APK 빌드 명령.

### 3.5 AWS 운영

- 운영 API 주소 `http://13.53.120.64:8000`과 Elastic IP의 역할.
- EC2 Ubuntu에서 백엔드 API만 Docker로 실행한다는 경계.
- `water-meter-api` 이미지와 `water-api` 컨테이너.
- `weights`와 `data` 호스트 볼륨을 통한 모델·SQLite 영속화.
- `unless-stopped` 재시작 정책, 로그 확인, 내부·외부 `/health`, EC2 재부팅 후 자동 복구 확인.
- 프론트 운영 번들이 `.env.production`을 통해 이 API를 바라보는 흐름.

### 3.6 실행과 검증

- `uv sync`와 FastAPI 로컬 실행.
- `npm install`, `npm run dev`, Node 테스트와 Vite 빌드.
- `npx cap sync android`와 Gradle APK 빌드.
- pytest, Node 테스트, Vite 빌드와 에뮬레이터 검증 결과.
- Android 실기기 카메라·알림 E2E가 아직 완료되지 않았음을 명시한다.

## 4. 저장소 정리 범위

### 유지

- 실행에 필요한 `src/`, `frontend/src/`, `frontend/public/img/`, `frontend/android/`.
- 계약과 운영 절차의 기준인 `docs/api-guide.md`, `docs/deployment-guide.md`.
- Python과 프론트엔드 테스트.
- 루트와 프론트 README.

### 통합 후 제거

- `docs/2026-07-14-frontend-integration-design.md`.
- `docs/2026-07-14-frontend-integration-plan.md`.
- `docs/implementation-log.md`.
- `docs/superpowers/specs/`와 `docs/superpowers/plans/`의 완료된 설계·계획.
- 런타임에서 참조하지 않는 `frontend/src/recovered/app.jsx.orig`.
- 원본 번들이 저장소에 없어 단독으로 재실행할 수 없는 일회성 `scripts/extract_frontend_source.py`.
- 무시된 추출 산출물 `extracted/`와 재생성 가능한 프론트·Android 빌드 산출물.
- 현재 API가 사용하지 않는 루트의 오래된 `data.db`.

중요한 결정, 실행 명령, 검증 결과와 미완료 항목은 제거 전에 이 문서로 옮긴다. 삭제된 내용은 Git 이력에서 계속 확인할 수 있다.

### Git에서 제외

- `.claude/`, `.superpowers/`와 로컬 작업용 `checklist.md`, `context-notes.md`.
- `output/android/*.apk`.
- 기존 빌드 산출물, 캐시, 로컬 데이터베이스와 모델 가중치.

`.venv`, `frontend/node_modules`, `weights`와 실제 `data/`는 로컬 실행 속도와 운영 데이터 보존을 위해 디스크에서는 유지한다. 정리 목적은 용량 확보가 아니라 저장소 가독성과 머지 준비다.

## 5. 성공 기준

- 팀원이 단일 Markdown 또는 PDF만 읽고 화면에서 API와 네이티브 기능으로 이어지는 경로를 설명할 수 있다.
- 모든 흐름도는 교차 화살표 없이 번호 순서로 읽힌다.
- 로컬 개발, Android APK 빌드와 AWS API 운영 확인 명령을 그대로 실행할 수 있다.
- APK 위치와 검증 상태가 `output/android/README.md`에 명확히 기록된다.
- 이전 문서를 제거한 뒤에도 중요한 결정과 미완료 실기기 검증이 누락되지 않는다.
- 전체 pytest, 프론트 Node 테스트, Vite 빌드, Capacitor 동기화와 Gradle 빌드가 통과한다.
- 최종 PDF를 PNG로 렌더링해 글자 잘림, 겹침, 깨진 한글과 교차 화살표가 없음을 확인한다.
