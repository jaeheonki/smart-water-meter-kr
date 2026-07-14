# 방울이 프론트엔드 연동 + Docker 배포 + Capacitor 앱 전환 설계

작성일: 2026-07-14
상태: 사용자 승인 대기

> **이 문서는 자기완결형이다.** 이 대화에 참여하지 않은 모델/개발자가 이 문서만 보고
> 구현할 수 있도록 작성했다. 각 Phase는 순서대로 진행하고, Phase마다 "완료 기준"을
> 통과해야 다음으로 넘어간다. `⚠️ 검증 필요` 표시는 이 문서 작성 시점에 실행으로
> 확인하지 못한 항목이므로 구현 시 반드시 실측으로 확인할 것.

---

## 1. 배경

- **프로젝트**: 방울이 — 스마트 수도 계량기 앱. 계량기 사진을 찍으면 YOLOX(ONNX)로
  숫자를 자동 인식하고, 실패 시 수동 입력으로 폴백. 사용량/요금 조회 기능 포함.
- **저장소**: `C:\Users\uj070\Desktop\smart_water_meter` (GitHub private:
  `jaeheonki/smart-water-meter-kr`, 작업 브랜치 `dev`)
- **백엔드**: FastAPI + SQLModel(SQLite) + ONNX Runtime 추론. `src/` 아래에 완성돼 있고
  EC2에서 이미 구동 실적 있음. 이번 작업에서 백엔드 로직은 거의 건드리지 않는다.
- **프론트**: 팀원이 Claude 아티팩트로 만든 React UI. 현재는
  `C:\Users\uj070\Downloads\방울이_공유용.html` (12MB 번들, 2026-07-14 버전) 형태로만 존재.
  원본 소스는 번들 안에 이스케이프된 채 보존되어 있음(추출 방법은 Phase 0).
- **기존 배포**: EC2 t2.micro(Ubuntu 22.04)에서 `nohup uvicorn` 맨몸 실행 중.
  `docs/deployment-guide.md` 참고. Dockerfile은 저장소에 있으나 실제로는 미사용.

## 2. 확정된 결정 사항 (사용자 승인 완료)

| 항목 | 결정 | 근거 |
|---|---|---|
| 앱 전환 방식 | **Capacitor 웹뷰 래핑** | 완성된 React UI 재사용률 최대, 스토어 배포 가능, MIT 라이선스 |
| 연동 범위 | **백엔드 전체 API** | 배포가 목표이므로 모든 화면 연동 |
| 배포 환경 | **기존 EC2 + Docker + Elastic IP** | HTTPS/도메인은 스토어 제출 직전으로 보류 |
| 사진 촬영 | **@capacitor/camera 플러그인** | 핵심 플로우라 기기별 동작 편차 없는 네이티브 제어 필요. 브라우저 개발 시엔 `<input type="file">` 폴백 |
| 프론트 소스 관리 | **Vite + React 정식 프로젝트로 복구** | 12MB 번들 직접 수정은 유지보수 불가 |
| 플랫폼 | **Android 우선** (개발자 PC가 Windows). iOS는 맥 보유 팀원이 §10 런북대로 진행 |

## 3. 목표 저장소 구조

```
smart_water_meter/
├─ src/                    # 기존 FastAPI 백엔드 (Phase 3에서 CORS, /health만 추가)
│  ├─ api/                 #   main.py, db.py, models.py, schemas.py, routers/
│  ├─ calculation/         #   요금 계산 (지역별 요금표)
│  └─ model/               #   YOLOX ONNX 추론 파이프라인
├─ frontend/               # [신규] Vite + React + Capacitor
│  ├─ src/
│  │  ├─ App.jsx           #   복구한 UI (기기 프레임 제거 후)
│  │  ├─ api.js            #   백엔드 API 클라이언트 (단일 모듈)
│  │  ├─ camera.js         #   사진 획득 추상화 (플러그인/웹 폴백)
│  │  └─ components/       #   화면별 컴포넌트 분리
│  ├─ android/             #   npx cap add android 산출물 (커밋함)
│  ├─ capacitor.config.json
│  ├─ .env.development     #   VITE_API_BASE_URL=http://localhost:8000
│  ├─ .env.production      #   VITE_API_BASE_URL=http://<Elastic IP>:8000
│  └─ package.json
├─ scripts/
│  └─ extract_frontend_source.py   # [작성됨] 번들→JSX 추출 (⚠️ 미검증)
├─ tests/                  # 기존 pytest — 계속 통과해야 함
├─ Dockerfile              # 기존 것 사용 (수정 불필요, §8 참고)
└─ docs/
```

## 4. 기술 스택

| 영역 | 선택 | 버전 방침 |
|---|---|---|
| Node.js | Node LTS | 구현 시점 LTS(22 이상). `node --version`으로 확인 |
| 빌드 도구 | Vite (react 템플릿) | `npm create vite@latest frontend -- --template react` 기본값 사용 |
| UI | React (템플릿 기본 버전) | 복구된 JSX가 인라인 스타일 기반이므로 CSS 프레임워크 **추가하지 않음** |
| 앱 래핑 | Capacitor `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` | 최신 안정판. `npm info @capacitor/core version`으로 확인. MIT |
| 카메라 | `@capacitor/camera` | Capacitor 코어와 메이저 버전 일치시킬 것 |
| 백엔드 | 기존 그대로 (FastAPI, SQLModel, onnxruntime) | `pyproject.toml` 변경 없음 |
| 배포 | Docker (python:3.12-slim 베이스, 기존 Dockerfile) | EC2 t2.micro, Elastic IP |

**하지 말 것**: TypeScript 전환, 상태관리 라이브러리 도입, CSS 프레임워크 추가,
백엔드 리팩토링. 전부 이번 스코프가 아니다.

---

## 5. Phase 0 — 번들에서 원본 소스 복구

**입력**: `C:\Users\uj070\Downloads\방울이_공유용.html`
**도구**: `scripts/extract_frontend_source.py` (작성 완료, ⚠️ 실행 미검증)

번들 구조 (2026-07-14 실물 파일에서 확인한 사실):
- `<script type="__bundler/manifest">` — 리소스(JS 라이브러리, woff2 폰트)의 base64 맵. **무시한다** (React 등은 npm으로 새로 받음).
- `<script type="__bundler/template">` — 원본 아티팩트 HTML이 JSON 문자열 이스케이프(`\n`, `\"`, `\/`, `\\`)로 보존됨. 이 안의 `<script type="text/babel">` 블록이 **원본 JSX 소스**.

절차:
1. `python scripts/extract_frontend_source.py "C:\Users\uj070\Downloads\방울이_공유용.html" extracted/`
2. `extracted/app.jsx`를 열어 확인: 정상 복구라면 `// Android.jsx — Simplified Android (Material 3) device frame` 주석과 `AndroidDevice`, `AndroidStatusBar` 등의 컴포넌트가 보인다 (실물에서 확인한 내용).
3. 이스케이프 잔재(`\n` 문자열, `\"` 등)가 코드에 남아있으면 스크립트의 `unescape_bundler()` 순서를 점검할 것.

**완료 기준**: `extracted/app.jsx`가 문법적으로 온전한 JSX이고(Babel/Vite 파싱 통과),
이스케이프 잔재가 없다. `extracted/` 폴더는 커밋하지 않는다(.gitignore에 추가).

## 6. Phase 1 — Vite 프로젝트 재구성

1. `frontend/` 스캐폴딩: `npm create vite@latest frontend -- --template react`
2. 복구한 JSX를 이식하되 **기기 프레임 목업을 제거**한다:
   - 제거 대상: `AndroidDevice`, `AndroidStatusBar`, `AndroidAppBar`, `AndroidNavBar`, `AndroidKeyboard` 등 데모용 베젤/상태바 컴포넌트와 데모용 폰트.
   - 유지 대상: 실제 앱 화면 컴포넌트 (JSX를 읽고 판단 — `<AndroidDevice>` children으로 들어가는 부분이 실제 앱).
3. 화면 단위로 `components/`에 분리. 원본이 `window`에 컴포넌트를 export하는 아티팩트 관례를 쓰고 있으면 ES module import/export로 바꾼다.
4. 상태 저장: 원본이 localStorage나 목데이터를 쓰고 있을 수 있음 — 이 단계에서는 그대로 두고 Phase 2에서 API로 교체.

**완료 기준**: `npm run dev`로 브라우저에서 전 화면이 기기 프레임 없이 렌더되고,
`npm run build`가 오류 없이 통과한다.

## 7. Phase 2 — API 연동

### 7-1. 엔드포인트 확정 (구현 첫 작업)

**이 문서는 엔드포인트 시그니처를 확정하지 않는다.** 구현 모델은 먼저
`src/api/routers/meter.py`, `history.py`, `regions.py`, `settings.py`와
`src/api/schemas.py`를 읽고 정확한 경로/메서드/요청·응답 스키마 표를 만든 뒤 진행할 것.
로컬에서 `uv run uvicorn src.api.main:app`을 띄워 `http://localhost:8000/docs`(Swagger)로
교차 확인하면 확실하다.

대화 기록으로 파악된 사실 (검증용 힌트):
- `GET /regions` → `{"regions": ["busan", "changwon", ..., "seoul", ...]}` (17개 지역)
- `POST /meter/manual` — 검침값 수동 입력. 두 번 이상 입력해야 사용량 계산 가능
- 사진 추론 엔드포인트가 meter 라우터에 있음(multipart 업로드, `pipeline.run()` 호출).
  추론 실패 시 HTTP 500이 아니라 `success: false`를 반환 (커밋 89cde36)
- `GET /history` — 검침 이력. 라벨은 `YYYY-MM-DD` 형식(커밋 21bb80d), 기간(period) 조회 지원
- settings — 지역 설정. 미설정 시 서울 기본값 (커밋 563c377)
- 사용자/기기 구분에 `device_id` 개념 사용

### 7-2. `frontend/src/api.js` — 단일 API 클라이언트

모든 fetch를 이 모듈 하나에 모은다. 화면 컴포넌트에서 직접 fetch 금지.

```js
// 백엔드 API 클라이언트 — 모든 서버 통신은 이 모듈을 거친다
const BASE = import.meta.env.VITE_API_BASE_URL;

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export async function uploadMeterPhoto(file) {
  const form = new FormData();
  form.append("file", file);            // ⚠️ 필드명은 라우터 시그니처 확인 후 확정
  return request("/meter/photo", { method: "POST", body: form });  // ⚠️ 경로 확인
}
// getRegions, saveManualReading, getHistory(params), getSettings, saveSettings ...
// → 7-1에서 만든 엔드포인트 표대로 함수 추가
```

- `VITE_API_BASE_URL`: `.env.development`는 `http://localhost:8000`,
  `.env.production`은 `http://<Elastic IP>:8000`. 코드에 URL 하드코딩 금지.
- 사진은 base64가 아닌 **multipart FormData**로 전송 (백엔드가 `python-multipart` 사용).

### 7-3. `frontend/src/camera.js` — 사진 획득 추상화

```js
// 사진 획득 — 앱에서는 네이티브 카메라, 브라우저 개발 중에는 파일 선택으로 동작
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

export async function getPhoto() {
  if (Capacitor.isNativePlatform()) {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 90,
    });
    const blob = await (await fetch(photo.webPath)).blob();
    return new File([blob], "meter.jpg", { type: blob.type });
  }
  // 웹 폴백: 파일 선택 다이얼로그
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => input.files[0] ? resolve(input.files[0]) : reject(new Error("취소됨"));
    input.click();
  });
}
```

### 7-4. 화면-API 매핑과 에러 처리

- 사진 촬영 화면: `getPhoto()` → `uploadMeterPhoto()` → 응답 `success: true`면 인식값을
  "이 숫자가 맞나요?" 확인 UI에 표시 → 사용자가 수정 가능 → 확정 시 저장.
  `success: false`면 **수동 입력 다이얼로 즉시 폴백** (에러 화면 아님 — 정상 플로우).
- 이력 화면: 월별 조회 + 기간 직접 입력 조회 둘 다 지원 (백엔드가 이미 지원).
- 네트워크 실패(fetch reject): "서버에 연결할 수 없습니다. 다시 시도해주세요" 토스트 + 재시도 버튼. 무한 스피너 금지.
- 원본 UI에 없는 화면은 **새로 만들지 않는다**. UI에 없는데 API에 있는 기능은 문서에 메모만 남길 것.

**완료 기준**: 로컬에서 백엔드(`uv run uvicorn src.api.main:app`) + 프론트(`npm run dev`)를
띄우고, 브라우저에서 사진 업로드→인식→확인→저장→이력 조회 전체 플로우가 실제 API로 동작.

## 8. Phase 3 — 백엔드 보강 (수정 2건만)

`src/api/main.py`에 추가:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # 데모 단계. 쿠키 인증 없으므로 허용 가능. 스토어 제출 전 축소할 것
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    """배포 확인 및 앱의 서버 연결 점검용."""
    return {"status": "ok"}
```

`allow_origins=["*"]`인 이유: Capacitor 앱의 origin은 플랫폼마다 다르고
(`https://localhost`, `capacitor://localhost`), 개발 중 Vite는 `http://localhost:5173`이다.
쿠키 기반 인증이 없으므로 와일드카드가 안전상 문제되지 않는다.
(`allow_credentials=True`와 `"*"`는 함께 못 쓰므로 credentials는 켜지 않는다.)

**완료 기준**: 기존 pytest 전체 통과 (`uv run pytest`) + `curl http://localhost:8000/health` 응답 확인.

## 9. Phase 4 — Docker 배포 (EC2)

기존 `Dockerfile` 그대로 사용한다 (python:3.12-slim + uv, onnxruntime CPU 교체,
weights/data 볼륨 설계까지 이미 반영됨). 수정 불필요.

EC2 접속 정보는 `docs/deployment-guide.md` 참고 (키: `Desktop\jae.pem`).
⚠️ 현재 IP `13.60.96.17`는 Elastic IP가 아니면 재부팅 시 바뀔 수 있음 — 아래 4단계에서 고정.

```bash
# 1. EC2에 Docker 설치 (Ubuntu 22.04 공식 방법)
sudo apt-get update && sudo apt-get install -y docker.io
sudo usermod -aG docker ubuntu   # 적용하려면 재로그인

# 2. 기존 nohup 서버 중지 후 코드 최신화
kill $(lsof -t -i:8000) || true
cd ~/smart-water-meter-kr && git pull origin dev

# 3. 이미지 빌드 및 실행 (t2.micro 1GB — 빌드 중 메모리 부족 시 스왑 추가: §12 리스크 참고)
docker build -t water-meter-api .
docker run -d --name water-api --restart unless-stopped \
  -p 8000:8000 \
  -v ~/smart-water-meter-kr/weights:/app/weights \
  -v ~/smart-water-meter-kr/data:/app/data \
  water-meter-api

# 4. AWS 콘솔에서 Elastic IP 할당 → 인스턴스에 연결
#    (실행 중인 인스턴스에 연결된 Elastic IP는 무료. 미연결 상태로 방치하면 과금)
#    할당 후 frontend/.env.production의 VITE_API_BASE_URL을 새 IP로 갱신
```

**완료 기준**: `curl http://<Elastic IP>:8000/health` 성공, EC2 재부팅
(`sudo reboot`) 후에도 컨테이너가 자동 복구되어 같은 curl이 성공.
`docs/deployment-guide.md`를 Docker 기반 절차로 갱신할 것.

## 10. Phase 5 — Capacitor 래핑 (Android)

```bash
cd frontend
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/camera
npx cap init "방울이" "com.bangwoolee.app" --web-dir dist
npm run build
npx cap add android
npx cap sync android
```

`capacitor.config.json`:

```json
{
  "appId": "com.bangwoolee.app",
  "appName": "방울이",
  "webDir": "dist",
  "server": {
    "androidScheme": "http",
    "cleartext": true
  }
}
```

- ⚠️ 검증 필요: 웹뷰 origin이 https면 http API 호출이 mixed content로 차단된다.
  위 설정(`androidScheme: "http"` + `cleartext: true`)이 이를 우회하는 조합인데,
  Capacitor 버전에 따라 동작이 다를 수 있으므로 **실기기에서 API 호출 성공을 반드시 확인**.
  안 되면 대안: `network_security_config.xml`에 EC2 IP를 cleartext 허용 도메인으로 등록.
- 카메라 권한: `android/app/src/main/AndroidManifest.xml`에
  `<uses-permission android:name="android.permission.CAMERA" />` 추가
  (@capacitor/camera 문서의 Android 섹션 그대로 따를 것).
- 빌드: Android Studio로 `frontend/android` 열고 실행, 또는
  `cd android && .\gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`.
- 사전 요구: Android Studio + JDK 17 (Capacitor 요구 버전은 공식 문서 확인).
- `frontend/android/` 폴더는 **커밋한다** (iOS 팀원과 동일 구조 공유, 권한 설정 보존).

**완료 기준 (최종 E2E)**: 실기기(Android)에 APK 설치 →
사진 촬영 → EC2 서버 추론 → 값 확인/수정 → 저장 → 이력 조회까지 전체 플로우 성공.

## 11. iOS 런북 (맥 보유 팀원용 — 다음 단계, 이번 스코프 아님)

macOS + Xcode 필수 (애플 정책상 다른 OS에서 불가). Windows 쪽에서 Phase 5까지
끝난 상태를 전제로, 맥에서:

```bash
git clone -b dev https://github.com/jaeheonki/smart-water-meter-kr.git
cd smart-water-meter-kr/frontend
npm install
npm run build
npm install @capacitor/ios
npx cap add ios
npx cap sync ios     # CocoaPods 필요: sudo gem install cocoapods
npx cap open ios     # Xcode 열림
```

Xcode에서 두 가지 수동 설정:
1. **Info.plist 권한/네트워크** — `ios/App/App/Info.plist`에 추가:
   - `NSCameraUsageDescription`: "계량기 사진 촬영을 위해 카메라를 사용합니다"
   - `NSPhotoLibraryUsageDescription`: "계량기 사진 선택을 위해 사진첩에 접근합니다"
   - ATS 예외 (HTTP API 허용): `NSAppTransportSecurity` → `NSAllowsArbitraryLoads: true`
     (임시 조치. 스토어 심사는 이 설정을 거부할 수 있으므로 제출 전 HTTPS 전환 필수)
2. **서명** — Signing & Capabilities 탭에서 본인 Apple ID 팀 선택.
   무료 계정으로 실기기 테스트 가능(7일마다 재서명 필요), 앱스토어/TestFlight 배포는
   Apple Developer Program(연 $99) 필요.

## 12. 리스크 및 미검증 항목

| # | 항목 | 대응 |
|---|---|---|
| 1 | `extract_frontend_source.py` 실행 미검증 | Phase 0 완료 기준으로 강제. 실패 시 폴백: 팀원의 claude.ai 아티팩트 대화에서 원본 코드 복사 요청 |
| 2 | Android http(cleartext) + mixed content | Phase 5에 실기기 검증 명시. 대안 경로 문서화됨 |
| 3 | t2.micro 1GB에서 docker build 메모리 부족 가능 | 실패 시 `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` 후 재시도 |
| 4 | Elastic IP 전환으로 기존 IP 무효화 | `.env.production`, `docs/deployment-guide.md`, README의 IP 표기 일괄 갱신 |
| 5 | HEIC 업로드 (아이폰 기본 포맷) | 백엔드에 pillow-heif 이미 있음. E2E에서 HEIC 파일로 1회 확인 |
| 6 | 원본 JSX 규모/구조 미확인 (12MB 중 JSX 부분) | Phase 1에서 화면 인벤토리를 먼저 만들고 분리 계획을 세울 것 |

## 13. 스코프 제외 (이번에 하지 않는 것)

- HTTPS/도메인 (스토어 제출 직전 단계로 보류 — Let's Encrypt + 저가 도메인 예정)
- 앱스토어/플레이스토어 실제 제출
- iOS 구현 (§11 런북 전달로 대체)
- 사용자 인증 강화, DB 마이그레이션, 백엔드 리팩토링

## 14. 전체 검증 체크리스트 (완료 선언 전 필수)

1. `uv run pytest` 전체 통과 (백엔드 회귀 없음)
2. `npm run build` 통과
3. 로컬 E2E: 브라우저 + 로컬 백엔드로 전체 플로우
4. 배포 E2E: `curl http://<Elastic IP>:8000/health` + Swagger로 추론 1회
5. 실기기 E2E: APK로 §10 완료 기준 통과
6. EC2 재부팅 후 컨테이너 자동 복구 확인
7. `docs/deployment-guide.md`, README 갱신 완료
