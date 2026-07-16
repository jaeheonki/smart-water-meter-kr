# README 구조 정리 설계

## 목표

팀원이 저장소에 들어왔을 때 프로젝트의 목적, 실행 방법, 프론트 구조와 전달 산출물 상태를 각 README에서 빠르게 파악할 수 있게 한다. 상세 프론트 연동 내용은 기존 인수인계 문서로 연결하고 README끼리 같은 내용을 반복하지 않는다.

## 문서별 책임

### 루트 `README.md`

- `frontend/public/img/base_happy2.png`를 대표 이미지로 표시한다.
- 프로젝트 한 줄 소개, 핵심 기술, 주요 기능을 상단에서 요약한다.
- 저장소 구조와 `data/`의 로컬 SQLite 역할 및 Git 제외 정책을 설명한다.
- 백엔드·프론트 빠른 실행, 테스트, Android 빌드 진입점을 제공한다.
- 상세 문서와 운영 API 안내를 연결한다.
- 팀원 섹션에는 김재헌(PM), 정승호, 노승원, 유수빈을 표시한다.
- 김재헌은 확인된 GitHub 계정 `jaeheonki`의 이미지와 프로필 링크를 사용한다. 나머지 세 명은 계정 확인 전까지 이름만 표시하고 가짜 링크나 깨진 이미지를 만들지 않는다.

### `frontend/README.md`

- React, Vite, Capacitor로 구성된 프론트의 책임과 주요 디렉터리를 설명한다.
- 개발·운영 API 환경변수, 웹 실행, 테스트와 프로덕션 빌드 명령을 제공한다.
- Android 동기화·빌드·실행 진입점과 Camera, Local Notifications 플러그인 상태를 설명한다.
- iOS는 재사용 가능한 구조와 Mac·Xcode·HTTPS 필요 조건만 안내하고 지원 완료로 표시하지 않는다.

### `output/README.md`

- `output/`이 소스가 아니라 팀 전달 산출물용 디렉터리임을 명시한다.
- APK 같은 바이너리는 Git에 커밋하지 않고 검증 후 GitHub Release로 공유한다는 정책을 설명한다.
- 현재 Android 산출물과 향후 iOS 산출물의 디렉터리 기준을 보여준다.
- Android 상세 정보는 `output/android/README.md`로 연결한다.

### `output/android/README.md`

- 현재 APK의 appId, 버전, 크기, 해시와 생성 시각을 유지한다.
- 설치·초기화·빌드 재현 명령과 완료·미완료 검증 항목을 유지한다.
- 일반 산출물 정책은 상위 README로 옮기고 Android 전달물 상세 문서로 범위를 좁힌다.

## 표현 원칙

- 루트 README는 중앙 대표 이미지, 짧은 소개, 표와 접을 수 없는 짧은 섹션을 사용해 스캔하기 쉽게 만든다.
- 실제 존재하는 명령, 파일과 검증 상태만 기록한다.
- Android 실기기 E2E와 iOS 지원을 완료된 것으로 표현하지 않는다.
- 기존 `docs/frontend-integration-handoff.md`와 API·배포 가이드의 상세 설명을 복제하지 않는다.

## 검증 기준

- README에서 참조한 로컬 파일과 이미지가 모두 존재한다.
- `npm`, `uv`, Capacitor와 Gradle 명령이 현재 프로젝트 설정과 일치한다.
- 이전 PDF 경로인 `output/pdf` 참조가 없다.
- Markdown 링크와 상대 경로가 저장소 루트를 기준으로 올바르다.
- 문서 변경만 별도 커밋하며 기존 Task 9 변경을 포함하지 않는다.

## 후속 작업

README 커밋 후 전체 Python·Node 테스트, Vite 빌드, Capacitor 동기화와 Android 빌드를 다시 실행한다. `feature_app_merge`와 `dev`의 diff, 미커밋 변경, 커밋 이력을 리뷰한 뒤 사용자 승인 전까지 실제 `dev` 머지는 수행하지 않는다.
