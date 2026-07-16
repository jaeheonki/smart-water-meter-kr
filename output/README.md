# 빌드 산출물

`output/`은 팀원이 설치·검토할 빌드 결과와 전달 정보를 모으는 폴더다. 실행 소스나 원본 프로젝트를 보관하지 않는다.

## 현재 구조

```text
output/
├─ README.md
└─ android/
   ├─ README.md
   └─ banguli-debug.apk   # 로컬 전달 파일, Git 제외
```

Android APK의 버전, 해시, 설치 방법과 검증 범위는 [Android 테스트 APK 상세](android/README.md)를 참고한다.

## 전달 정책

- APK와 IPA 같은 앱 바이너리는 Git 커밋에 포함하지 않는다.
- 로컬 검증 중인 파일은 플랫폼별 하위 폴더에 두고 `.gitignore`로 제외한다.
- 파일을 공유할 때는 appId 또는 Bundle ID, 버전, 빌드 유형, 크기와 SHA-256을 함께 기록한다.
- 실기기 검증을 마친 배포 후보는 GitHub Release 첨부 파일로 공유한다.
- 소스에서 다시 만들 수 있는 `frontend/dist/`와 Gradle 빌드 캐시는 전달물로 보존하지 않는다.

## 플랫폼별 상태

| 플랫폼 | 경로 | 상태 |
|---|---|---|
| Android | `output/android/` | Debug APK 존재, 에뮬레이터 기본 흐름 검증 완료, 실기기 E2E 미완료 |
| iOS | `output/ios/` | 디렉터리와 산출물 없음 |

iOS 빌드를 시작하면 검증된 `.ipa` 또는 TestFlight 전달 정보를 `output/ios/` 아래에 분리한다. 현재는 생성하지 않는다.

## 관련 문서

- [프로젝트 전체 안내](../README.md).
- [프론트엔드 개발과 모바일 빌드](../frontend/README.md).
- [프론트엔드 연동 인수인계](../docs/frontend-integration-handoff.md).
