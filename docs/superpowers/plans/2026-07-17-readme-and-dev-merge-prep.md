# README 정리와 dev 머지 준비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팀원이 프로젝트·프론트·전달 산출물을 빠르게 이해할 수 있도록 README 책임을 분리하고, `feature_app_merge`를 `dev`에 머지하기 전 검증 상태와 남은 차단 조건을 명확히 한다.

**Architecture:** 루트 README는 전체 진입점만 담당하고 상세 개발 정보는 `frontend/README.md`, 산출물 정책은 `output/README.md`, APK 상세는 `output/android/README.md`가 담당한다. 문서 커밋 후 전체 자동 검증과 `dev...feature_app_merge` diff 리뷰를 수행하되 사용자 승인과 Android 실기기 E2E 전에는 실제 머지를 실행하지 않는다.

**Tech Stack:** Markdown, FastAPI, pytest, React 19, Vite 8, Capacitor 8, Android Gradle.

## Global Constraints

- 작업 브랜치는 `feature_app_merge`이며 `dev`와 `main`에 직접 커밋하지 않는다.
- 새 라이브러리와 기능을 추가하지 않는다.
- README는 실제 존재하는 명령, 파일과 검증 상태만 기록한다.
- Android 실기기 E2E와 iOS 지원을 완료된 것으로 표현하지 않는다.
- 김재헌은 `jaeheonki` 프로필을 연결하고 정승호·노승원·유수빈은 계정 확인 전까지 이름만 표시한다.
- README 변경은 기존 미커밋 Task 9 변경과 분리해 커밋한다.
- 실제 `dev` 머지는 사용자 최종 승인 전에는 수행하지 않는다.

---

### Task 1: README 책임 분리

**Files:**
- Modify: `README.md`
- Create: `frontend/README.md`
- Create: `output/README.md`
- Modify: `output/android/README.md`

**Interfaces:**
- Consumes: `frontend/public/img/base_happy2.png`, `frontend/package.json`, `frontend/capacitor.config.json`, `.env.development`, `.env.production`, `output/android/banguli-debug.apk` 전달 정보.
- Produces: 저장소 전체, 프론트 개발, 산출물 정책, Android APK 상세로 분리된 네 README.

- [ ] **Step 1: 루트 README를 전체 진입점으로 재작성한다**

상단에 아래 형식의 대표 이미지와 소개를 배치한다.

```html
<p align="center">
  <img src="frontend/public/img/base_happy2.png" width="180" alt="방울이">
</p>
<h1 align="center">방울이</h1>
<p align="center">수도 계량기 사진을 인식하고 사용량·요금·환경 영향을 알려주는 스마트 수도 계량기 앱</p>
```

그 아래에 `주요 기능`, `기술 구성`, `빠른 시작`, `저장소 구조`, `테스트`, `모바일 앱`, `문서`, `팀원` 순서로 짧은 섹션을 둔다. `data/`는 로컬 SQLite이며 Git에서 제외되고 EC2 데이터와 별개라는 설명을 포함한다. 팀원은 김재헌(PM), 정승호, 노승원, 유수빈을 표시하며 `jaeheonki`만 이미지와 링크를 적용한다.

- [ ] **Step 2: 프론트 README를 작성한다**

다음 내용을 실제 경로와 명령으로 작성한다.

```text
역할 → 디렉터리 구조 → 환경변수 → 웹 실행 → 테스트와 빌드 → Android → 네이티브 플러그인 → iOS 확장 조건 → 관련 문서
```

웹 검증 명령은 `node --test`, `npm run build`를 사용한다. Android는 `npm run build`, `npx cap sync android`, `frontend/android/gradlew.bat assembleDebug` 흐름을 설명한다. iOS는 Mac, Xcode 26+, HTTPS가 필요하며 현재 완료 범위가 아님을 명시한다.

- [ ] **Step 3: output README를 작성한다**

`output/`은 전달 산출물 디렉터리이며 APK 바이너리는 Git에서 제외한다는 정책을 기록한다. 현재 구조는 아래처럼 표시한다.

```text
output/
├─ README.md
└─ android/
   ├─ README.md
   └─ banguli-debug.apk   # 로컬 파일, Git 제외
```

향후 iOS 결과물은 검증된 뒤 `output/ios/`로 분리할 수 있지만 현재 생성된 iOS 산출물은 없다고 명시한다.

- [ ] **Step 4: Android README의 중복 정책을 상위 문서로 연결한다**

문서 상단에 `[산출물 공통 정책](../README.md)` 링크를 추가한다. 기존 APK 메타데이터, 설치, 빌드 재현, 확인된 항목과 남은 실기기 확인은 변경하지 않는다.

- [ ] **Step 5: README 경로와 오래된 참조를 검증한다**

Run:

```powershell
rg -n "output/pdf|TODO|TBD" README.md frontend/README.md output/README.md output/android/README.md
Test-Path frontend/public/img/base_happy2.png
Test-Path docs/banguli-frontend-integration.pdf
Test-Path output/android/README.md
git diff --check -- README.md frontend/README.md output/README.md output/android/README.md
```

Expected: `output/pdf`, `TODO`, `TBD` 검색 결과가 없고 세 `Test-Path`가 모두 `True`, `git diff --check`가 종료 코드 0이다.

- [ ] **Step 6: README 변경만 커밋한다**

```powershell
git add -- README.md frontend/README.md output/README.md output/android/README.md
git diff --cached --check
git commit -m "docs: 프로젝트와 전달물 README 정리"
```

Expected: 기존 `frontend/src/App.jsx`, 패키지 파일, Android 프로젝트는 커밋에 포함되지 않는다.

---

### Task 2: 전체 검증

**Files:**
- Verify: `src/`, `tests/`, `frontend/src/`, `frontend/tests/`, `frontend/android/`

**Interfaces:**
- Consumes: 현재 `feature_app_merge` 작업 트리와 잠금 파일.
- Produces: 머지 준비 판단에 사용할 fresh 테스트·빌드 결과.

- [ ] **Step 1: Python 테스트를 실행한다**

Run: `uv run pytest`

Expected: 42 tests pass. 기존 Starlette/httpx 경고는 실패로 보지 않되 결과에 기록한다.

- [ ] **Step 2: 프론트 Node 테스트를 실행한다**

Run from `frontend`: `node --test`

Expected: 59 tests pass.

- [ ] **Step 3: Vite 프로덕션 빌드를 실행한다**

Run from `frontend`: `npm run build`

Expected: 종료 코드 0. 기존 500kB 청크 경고는 결과에 기록한다.

- [ ] **Step 4: Capacitor Android 동기화를 실행한다**

Run from `frontend`: `npx cap sync android`

Expected: Camera와 Local Notifications 플러그인이 등록되고 종료 코드 0이다.

- [ ] **Step 5: Android Debug APK를 빌드한다**

Run from `frontend/android` after setting Android Studio JDK 21 and SDK variables: `./gradlew.bat assembleDebug`

Expected: `BUILD SUCCESSFUL`과 `app/build/outputs/apk/debug/app-debug.apk` 생성.

---

### Task 3: dev 머지 준비 리뷰

**Files:**
- Review: Git refs, staged/unstaged files, commit history and `dev...feature_app_merge` diff.

**Interfaces:**
- Consumes: Task 2의 fresh 검증 결과.
- Produces: 머지 가능 변경, 남은 차단 조건, 사용자 승인 요청.

- [ ] **Step 1: 브랜치와 작업 트리를 확인한다**

Run:

```powershell
git branch --show-current
git status --short
git log --oneline --decorate dev..feature_app_merge
```

Expected: 현재 브랜치는 `feature_app_merge`다. 미커밋 Task 9 파일은 별도로 식별한다.

- [ ] **Step 2: dev 대비 변경 범위를 리뷰한다**

Run:

```powershell
git diff --stat dev...feature_app_merge
git diff --name-status dev...feature_app_merge
git diff --check dev...feature_app_merge
```

Expected: 충돌 표시나 whitespace 오류가 없다. 문서, 백엔드, 프론트와 Android 변경이 의도한 범위인지 분류한다.

- [ ] **Step 3: 머지 차단 조건을 보고한다**

다음을 명시한다.

```text
- 자동 테스트·빌드 결과
- README 커밋과 Task 9 미커밋 파일 상태
- Android 에뮬레이터 검증 완료 범위
- Android 실기기 카메라·알림 E2E 미완료 여부
- 실제 dev 머지를 위해 필요한 사용자 승인
```

Android 실기기 E2E가 남아 있으면 Task 9 완료나 완전한 머지 준비 완료로 선언하지 않는다.

- [ ] **Step 4: 실제 머지 전에 멈춘다**

사용자가 `dev` 머지를 명시적으로 승인하기 전에는 checkout, merge, push를 수행하지 않는다.
