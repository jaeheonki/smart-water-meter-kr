# 방울이 프론트 연동 + Docker 배포 + Capacitor 앱 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude 아티팩트 번들로만 존재하는 React UI를 Vite 프로젝트로 복구해 기존 FastAPI 백엔드 전체 API와 연동하고, EC2에 Docker로 배포한 뒤 Capacitor로 Android APK까지 만든다.

**Architecture:** 모노레포 — 기존 `src/`(FastAPI+ONNX 추론, 거의 무수정) 옆에 `frontend/`(Vite+React+Capacitor)를 신설. 프론트는 `api.js` 단일 클라이언트 모듈로만 서버와 통신하고, 사진 획득은 `camera.js`가 네이티브 플러그인/웹 폴백을 추상화한다. 배포는 기존 Dockerfile로 EC2 t2.micro에서 컨테이너 구동.

**Tech Stack:** Node LTS(22+), Vite(react 템플릿), React, Capacitor(@capacitor/core·cli·android·camera 최신 안정판), FastAPI, Docker.

**설계 문서:** `docs/2026-07-14-frontend-integration-design.md` — 결정 근거와 리스크는 그쪽 참고. 이 문서는 실행 절차다.

## Global Constraints

- 작업 브랜치: `feature_app_merge` (이미 생성·푸시됨). dev/main 직접 커밋 금지.
- 커밋 메시지에 `Co-Authored-By` 줄 절대 금지 — jaeheonki 이름으로만.
- 주석은 한국어, 변수·함수명은 영어. 새 소스 파일 첫 줄에 파일 역할 한국어 한 줄 주석.
- 로컬은 Windows 11 + PowerShell (`&&` 대신 `;`), EC2는 Ubuntu bash. 명령 블록에 표기된 환경을 따를 것.
- 스펙에 없는 라이브러리 추가 금지: TypeScript, 상태관리(Redux 등), CSS 프레임워크, 테스트 프레임워크(vitest 등) 도입하지 않는다.
- 백엔드 의존성(`pyproject.toml`) 변경 금지.
- 각 태스크 완료 전 해당 검증 명령(pytest / npm run build / curl)을 실제 실행해 통과 확인. 실행 없이 완료 선언 금지.

## 확정 API 명세 (라우터 소스에서 검증 완료 — 추측 아님)

모든 요청·응답은 JSON (스캔 업로드만 multipart). `X-Device-ID` 헤더로 기기를 구분한다.

| 메서드·경로 | 인증 헤더 | 요청 | 응답 | 특이사항 |
|---|---|---|---|---|
| `POST /meter/scan` | 불필요 | multipart, 필드명 **`image`** | `{success: bool, reading_m3: float\|null, confidence: float\|null}` | DB 저장 안 함. 인식 실패도 200 + `success:false` |
| `POST /meter/manual` | `X-Device-ID` 필수 | `{reading_m3: float, confidence?: float, input_mode: "auto"\|"manual"}` | `{reading_m3, recorded_at, first_reading: bool, usage_m3?, prev_reading_m3?, bill?: {water,sewage,water_use_fee,vat,total}, impact?: {energy_kwh,co2_kg}}` | 첫 검침이면 `first_reading:true`+계산 필드 null. 현재값 ≤ 이전값이면 **422** |
| `GET /history` | `X-Device-ID` 필수 | — | `[{start_label,end_label,usage_m3,bill_total,co2_kg}]` 최신순 | 검침 2개 미만이면 `[]` |
| `GET /history/period?start=YYYY-MM-DD&end=YYYY-MM-DD` | `X-Device-ID` 필수 | 쿼리스트링 | 위와 동일 | 형식 안 맞으면 422 |
| `GET /settings` | `X-Device-ID` 필수 | — | `{region: string}` | 미설정이면 `"seoul"` 반환 |
| `PUT /settings` | `X-Device-ID` 필수 | `{region: string}` | `{region}` | 미지원 지역 코드면 422 |
| `GET /regions` | 불필요 | — | `{regions: string[]}` 17개 | 지역 선택 UI 구성용 |
| `GET /health` | 불필요 | — | `{status: "ok"}` | **Task 3에서 신규 추가** |

`X-Device-ID` 누락 시 400 `{"detail": "X-Device-ID 헤더가 필요합니다."}`.

---

### Task 1: 번들에서 원본 프론트 소스 복구

**Files:**
- Modify: `.gitignore` (extracted/ 추가)
- 실행: `scripts/extract_frontend_source.py` (작성돼 있음, **최초 실행·검증이 이 태스크**)
- 산출: `extracted/template.html`, `extracted/app.jsx` (커밋 안 함)

**Interfaces:**
- Produces: `extracted/app.jsx` — Task 2가 이식할 원본 JSX

- [ ] **Step 1: extracted/를 .gitignore에 추가**

`.gitignore` 끝에 추가:

```
# 번들 복구 산출물 (원본은 Downloads의 방울이_공유용.html)
extracted/
```

- [ ] **Step 2: 추출 스크립트 실행** (PowerShell, 프로젝트 루트)

```powershell
python scripts/extract_frontend_source.py "C:\Users\uj070\Downloads\방울이_공유용.html" extracted/
```

Expected: `저장: extracted\template.html (...)`, `저장: extracted\app.jsx (...)`, `완료: JSX 블록 N개 추출`

- [ ] **Step 3: 복구 품질 검증**

1. `extracted/app.jsx`를 열어 앞부분에 `// Android.jsx — Simplified Android (Material 3) device frame` 주석과 `AndroidDevice`, `AndroidStatusBar` 컴포넌트가 보이는지 확인 (번들 실물에서 확인된 내용 — 이게 없으면 추출 실패).
2. 이스케이프 잔재 검사 — 결과가 0건이어야 함:

```powershell
Select-String -Path extracted\app.jsx -Pattern '\\n","\\"' -SimpleMatch | Measure-Object
```

3. 잔재가 있으면 `scripts/extract_frontend_source.py`의 `unescape_bundler()` 치환 순서를 수정 후 재실행 (이중 백슬래시 임시 치환이 반드시 첫 번째여야 한다).
4. 복구가 계속 실패하면 **중단하고 사용자에게 보고** — 폴백은 팀원의 claude.ai 아티팩트 대화에서 원본 코드 복사.

- [ ] **Step 4: 커밋**

```powershell
git add .gitignore; git commit -m "chore: 번들 복구 산출물 폴더 gitignore 추가"
```

---

### Task 2: Vite 프로젝트 스캐폴딩 및 UI 이식

**Files:**
- Create: `frontend/` (Vite react 템플릿 전체)
- Create: `frontend/src/recovered/app.jsx.orig` (원본 보존용 사본 — import 금지)
- Create: `frontend/src/components/*.jsx` (화면별 분리 — 파일명은 인벤토리 후 결정)
- Create: `frontend/.env.development`, `frontend/.env.production`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `extracted/app.jsx` (Task 1)
- Produces: 기기 프레임 없이 렌더되는 React 앱. 이후 태스크는 `frontend/src/components/` 아래 화면 컴포넌트를 수정한다.

- [ ] **Step 1: 스캐폴딩** (PowerShell, 프로젝트 루트)

```powershell
npm create vite@latest frontend -- --template react
cd frontend; npm install
```

- [ ] **Step 2: 환경변수 파일 생성**

`frontend/.env.development`:
```
VITE_API_BASE_URL=http://localhost:8000
```

`frontend/.env.production` (IP는 Task 8에서 Elastic IP로 갱신):
```
VITE_API_BASE_URL=http://13.60.96.17:8000
```

- [ ] **Step 3: 원본 보존 및 화면 인벤토리**

1. `extracted/app.jsx`를 `frontend/src/recovered/app.jsx.orig`로 복사 (참조용, 절대 import하지 않음).
2. 원본을 정독하고 **화면 인벤토리**를 만든다: 어떤 화면(홈/촬영/수동입력/이력/설정 등)이 있고, 각 화면이 어떤 컴포넌트 함수인지, 데모용 목데이터·localStorage 사용처가 어디인지. 인벤토리는 이 계획 문서를 수정하지 말고 `frontend/src/components/README.md`에 기록한다.

- [ ] **Step 4: 기기 프레임 제거 및 컴포넌트 분리**

- 제거: `AndroidDevice`, `AndroidStatusBar`, `AndroidAppBar`, `AndroidListItem`, `AndroidNavBar`, `AndroidKeyboard` 등 데모 베젤·상태바 컴포넌트, 데모용 폰트 참조.
- `<AndroidDevice>`의 children으로 들어가던 실제 앱 화면을 화면 단위로 `frontend/src/components/`에 파일 분리. `window`에 export하는 아티팩트 관례는 ES module `export`/`import`로 전환.
- 아티팩트 전역(React UMD 등)에 의존하던 부분은 `import { useState } from "react"` 식으로 정리.
- 목데이터·localStorage 상태 로직은 **이 단계에서 그대로 유지** (Task 6·7에서 API로 교체).

- [ ] **Step 5: 렌더 및 빌드 검증**

```powershell
npm run dev
```
브라우저(`http://localhost:5173`)에서 전 화면이 기기 프레임 없이 렌더·전환되는지 확인 후:

```powershell
npm run build
```
Expected: `✓ built in ...` 오류 0건.

- [ ] **Step 6: 커밋**

```powershell
cd ..; git add frontend/; git commit -m "feat: 아티팩트 번들에서 복구한 프론트를 Vite 프로젝트로 재구성"
```

---

### Task 3: 백엔드 CORS + /health (TDD)

**Files:**
- Test: `tests/api/test_health.py` (신규)
- Modify: `src/api/main.py`

**Interfaces:**
- Produces: `GET /health` → `{"status": "ok"}`, 모든 응답에 `access-control-allow-origin: *` 헤더. 프론트 개발 서버(5173)와 Capacitor 웹뷰의 크로스 오리진 호출 허용.

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/api/test_health.py`

```python
# GET /health 및 CORS 헤더 테스트
def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_cors_preflight(client):
    """Vite 개발 서버 오리진의 preflight 요청이 허용되는지 확인."""
    resp = client.options(
        "/regions",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "*"
```

(`client` fixture는 `tests/api/conftest.py`에 이미 있음 — 인메모리 DB + TestClient.)

- [ ] **Step 2: 실패 확인**

```powershell
uv run pytest tests/api/test_health.py -v
```
Expected: 2건 FAIL (404 Not Found / 헤더 없음).

- [ ] **Step 3: 구현** — `src/api/main.py`

import 블록에 추가:
```python
from fastapi.middleware.cors import CORSMiddleware
```

`app = FastAPI(...)` 바로 다음에 추가:
```python
# CORS — Capacitor 웹뷰(https://localhost 등)와 Vite 개발 서버(5173)의 호출 허용.
# 쿠키 인증이 없으므로 와일드카드 허용이 안전상 문제되지 않는다. 스토어 제출 전 축소 예정.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """배포 확인 및 앱의 서버 연결 점검용."""
    return {"status": "ok"}
```

- [ ] **Step 4: 통과 확인 + 전체 회귀**

```powershell
uv run pytest tests/api/test_health.py -v
uv run pytest
```
Expected: 신규 2건 PASS, 기존 전체 PASS.

- [ ] **Step 5: 커밋**

```powershell
git add tests/api/test_health.py src/api/main.py; git commit -m "feat: CORS 미들웨어와 /health 엔드포인트 추가"
```

---

### Task 4: API 클라이언트 모듈 (api.js)

**Files:**
- Create: `frontend/src/api.js`

**Interfaces:**
- Consumes: Task 3의 CORS (로컬 검증에 필요), 위 "확정 API 명세" 표
- Produces (Task 6·7이 사용):
  - `getDeviceId(): string`
  - `scanMeter(file: File): Promise<{success, reading_m3, confidence}>`
  - `saveReading({reading_m3, confidence, input_mode}): Promise<ManualResponse>`
  - `getHistory(): Promise<HistoryItem[]>`
  - `getHistoryPeriod(start: string, end: string): Promise<HistoryItem[]>`
  - `getRegions(): Promise<string[]>`
  - `getSettings(): Promise<{region}>`
  - `saveSettings(region: string): Promise<{region}>`
  - `ApiError` 클래스 — `status: number`, `body: string` 프로퍼티

- [ ] **Step 1: api.js 작성** — 파일 전체:

```js
// 백엔드 API 클라이언트 — 모든 서버 통신은 이 모듈을 거친다 (화면에서 fetch 직접 호출 금지)
const BASE = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
  constructor(status, body) {
    super(`API ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

// 기기 식별자 — 최초 실행 시 UUID를 만들어 localStorage에 보존
export function getDeviceId() {
  let id = localStorage.getItem("device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("device_id", id);
  }
  return id;
}

async function request(path, options = {}) {
  const headers = { "X-Device-ID": getDeviceId(), ...options.headers };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

// 사진 스캔 — DB 저장 없음. success:false는 인식 실패(정상 플로우, 수동 입력 폴백)
export async function scanMeter(file) {
  const form = new FormData();
  form.append("image", file); // 백엔드 파라미터명 image 고정
  return request("/meter/scan", { method: "POST", body: form });
}

// 검침값 확정 저장 + 요금 계산. 현재값 ≤ 이전값이면 422 (ApiError.status === 422)
export async function saveReading({ reading_m3, confidence = null, input_mode }) {
  return request("/meter/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reading_m3, confidence, input_mode }),
  });
}

export async function getHistory() {
  return request("/history");
}

export async function getHistoryPeriod(start, end) {
  return request(`/history/period?start=${start}&end=${end}`);
}

export async function getRegions() {
  return (await request("/regions")).regions;
}

export async function getSettings() {
  return request("/settings");
}

export async function saveSettings(region) {
  return request("/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ region }),
  });
}
```

- [ ] **Step 2: 동작 검증** (자동 테스트 프레임워크는 스코프 외 — 실서버로 확인)

백엔드 기동(별도 PowerShell 창): `uv run uvicorn src.api.main:app --port 8000`
`frontend/`에서 `npm run dev` 후 브라우저 콘솔(F12)에서:

```js
const api = await import("/src/api.js");
await api.getRegions();          // → 17개 지역 배열
await api.getSettings();          // → {region: "seoul"}
await api.saveReading({ reading_m3: 100, input_mode: "manual" }); // → first_reading: true
await api.getHistory();           // → [] (검침 1개뿐)
```

CORS 오류가 나면 Task 3 미적용 상태 — 백엔드 재기동 확인.

- [ ] **Step 3: 커밋**

```powershell
git add frontend/src/api.js; git commit -m "feat: 백엔드 API 클라이언트 모듈 추가"
```

---

### Task 5: 사진 획득 추상화 (camera.js)

**Files:**
- Create: `frontend/src/camera.js`
- Modify: `frontend/package.json` (Capacitor 패키지 설치)

**Interfaces:**
- Produces: `getPhoto(): Promise<File>` — Task 6이 사용. 네이티브에서는 카메라 실행, 브라우저에서는 파일 선택.

- [ ] **Step 1: Capacitor 패키지 설치** (`frontend/`에서)

```powershell
npm install @capacitor/core @capacitor/cli @capacitor/camera
```

(웹 빌드에서도 `Capacitor.isNativePlatform()`이 false를 반환하며 정상 동작 — 네이티브 초기화는 Task 9.)

- [ ] **Step 2: camera.js 작성** — 파일 전체:

```js
// 사진 획득 추상화 — 앱에서는 네이티브 카메라, 브라우저 개발 중에는 파일 선택으로 동작
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
    return new File([blob], "meter.jpg", { type: blob.type || "image/jpeg" });
  }
  // 웹 폴백: 파일 선택 다이얼로그
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () =>
      input.files[0] ? resolve(input.files[0]) : reject(new Error("cancelled"));
    input.click();
  });
}
```

- [ ] **Step 3: 빌드 확인 + 커밋**

```powershell
npm run build
cd ..; git add frontend/; git commit -m "feat: 사진 획득 추상화 모듈 및 Capacitor 패키지 추가"
```

---

### Task 6: 스캔 플로우 화면 연동

**Files:**
- Modify: `frontend/src/components/` 중 촬영·확인·수동입력 화면 (Task 2 인벤토리에서 확정된 파일)

**Interfaces:**
- Consumes: `getPhoto()`(Task 5), `scanMeter`·`saveReading`·`ApiError`(Task 4)

핵심 플로우 — 설계 문서 §7-4:

```
촬영 버튼 → getPhoto() → scanMeter(file)
  ├─ success:true  → 인식값 확인 UI ("이 숫자가 맞나요?", 수정 가능)
  │                   확정 → saveReading({reading_m3, confidence, input_mode:"auto"})
  └─ success:false → 수동 입력 다이얼로 즉시 전환 (에러 화면 아님)
                      입력 → saveReading({reading_m3, input_mode:"manual"})
저장 응답: first_reading:true → "첫 검침 저장" 안내 / false → bill.total 등 결과 표시
```

- [ ] **Step 1: 촬영 화면의 목데이터 핸들러를 위 플로우로 교체.** 핸들러 골격:

```jsx
async function handleScan() {
  try {
    const file = await getPhoto();
    setLoading(true);
    const scan = await scanMeter(file);
    if (scan.success) {
      setScanResult(scan);          // 확인 UI로: reading_m3, confidence 표시
    } else {
      setManualMode(true);          // 수동 입력 다이얼로 폴백
    }
  } catch (e) {
    setError("서버에 연결할 수 없습니다. 다시 시도해주세요.");
  } finally {
    setLoading(false);
  }
}

async function handleConfirm(value, fromScan) {
  try {
    const saved = await saveReading({
      reading_m3: value,
      confidence: fromScan ? scanResult.confidence : null,
      input_mode: fromScan ? "auto" : "manual",
    });
    setResult(saved);               // first_reading 여부에 따라 결과 화면 분기
  } catch (e) {
    if (e instanceof ApiError && e.status === 422) {
      setError("검침값이 이전 기록보다 작습니다. 값을 확인해주세요.");
    } else {
      setError("저장에 실패했습니다. 다시 시도해주세요.");
    }
  }
}
```

(상태 변수명·UI 구조는 복구된 원본 화면에 맞춘다. 원칙: 네트워크 실패는 재시도 안내, 무한 스피너 금지, `success:false`는 에러가 아니라 수동 입력 전환.)

- [ ] **Step 2: 로컬 검증** — 백엔드 기동 후 브라우저에서: 계량기 사진 1장으로 스캔→확인→저장, 일부러 흐린 사진으로 `success:false`→수동 입력 폴백, 이전보다 작은 값 입력으로 422 안내 노출. 3케이스 모두 확인.

- [ ] **Step 3: 커밋**

```powershell
git add frontend/src/; git commit -m "feat: 사진 스캔-확인-저장 플로우 API 연동"
```

---

### Task 7: 이력·설정 화면 연동

**Files:**
- Modify: `frontend/src/components/` 중 이력·설정 화면

**Interfaces:**
- Consumes: `getHistory`·`getHistoryPeriod`·`getRegions`·`getSettings`·`saveSettings`(Task 4)

- [ ] **Step 1: 이력 화면** — 목데이터를 `getHistory()`로 교체. 기간 조회 UI가 있으면 `getHistoryPeriod(start, end)` 연결(날짜는 `YYYY-MM-DD` 문자열). 빈 배열이면 "검침 기록이 2개 이상 쌓이면 사용량이 표시됩니다" 안내.
- [ ] **Step 2: 설정 화면** — 지역 목록을 `getRegions()`로 채우고, 현재값 `getSettings()`, 변경 시 `saveSettings(region)`. 원본 UI에 없는 화면은 새로 만들지 않는다(설계 §7-4).
- [ ] **Step 3: 로컬 검증** — 검침을 2회 이상 저장한 상태에서 이력이 최신순으로 표시되는지, 지역 변경 후 재조회 시 유지되는지 확인.
- [ ] **Step 4: 커밋**

```powershell
git add frontend/src/; git commit -m "feat: 이력·설정 화면 API 연동"
```

---

### Task 8: EC2 Docker 배포

**Files:**
- Modify: `docs/deployment-guide.md` (Docker 기반 절차로 갱신)
- Modify: `frontend/.env.production` (Elastic IP 반영)

**Interfaces:**
- Produces: `http://<Elastic IP>:8000` — Task 9의 APK가 바라볼 안정된 주소

접속: `ssh -i "C:\Users\uj070\Desktop\jae.pem" ubuntu@13.60.96.17` (PowerShell)

- [ ] **Step 1: EC2에서 Docker 설치 및 기존 서버 정리** (EC2 bash)

```bash
sudo apt-get update && sudo apt-get install -y docker.io
sudo usermod -aG docker ubuntu    # 반영 위해 exit 후 재접속
kill $(lsof -t -i:8000) || true   # 기존 nohup uvicorn 중지
cd ~/smart-water-meter-kr && git fetch origin && git checkout feature_app_merge && git pull
```

- [ ] **Step 2: 이미지 빌드·기동** (EC2 bash)

```bash
docker build -t water-meter-api .
docker run -d --name water-api --restart unless-stopped \
  -p 8000:8000 \
  -v ~/smart-water-meter-kr/weights:/app/weights \
  -v ~/smart-water-meter-kr/data:/app/data \
  water-meter-api
curl http://localhost:8000/health   # → {"status":"ok"}
```

빌드가 메모리 부족(OOM/Killed)으로 실패하면 스왑 추가 후 재시도:
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

- [ ] **Step 3: Elastic IP 고정** — AWS 콘솔 → EC2 → 탄력적 IP → 할당 → 인스턴스에 연결. (실행 중 인스턴스 연결 상태면 무료, 미연결 방치 시 과금.) 새 IP로 `frontend/.env.production` 갱신.

- [ ] **Step 4: 외부 검증 + 재부팅 내성** (PowerShell)

```powershell
curl http://<Elastic IP>:8000/health
```
EC2에서 `sudo reboot` 후 2분 뒤 같은 curl 재실행 → 컨테이너 자동 복구 확인.

- [ ] **Step 5: 배포 문서 갱신 + 커밋** — `docs/deployment-guide.md`의 nohup 절차를 위 Docker 절차로 교체(기존 5·6절 대체), 새 IP 반영.

```powershell
git add docs/deployment-guide.md frontend/.env.production; git commit -m "docs: EC2 배포 절차를 Docker 기반으로 갱신"
```

- [ ] **주의**: dev 브랜치 기준으로 돌던 기존 서버를 feature 브랜치로 바꾼 것 — 팀원에게 공유할 것.

---

### Task 9: Capacitor Android 래핑 + 실기기 E2E

**Files:**
- Create: `frontend/capacitor.config.json`, `frontend/android/` (커밋함)
- Modify: `frontend/android/app/src/main/AndroidManifest.xml` (카메라 권한)
- Modify: `README.md` (프론트 빌드·APK 절차 추가)

**Interfaces:**
- Consumes: Task 8의 `http://<Elastic IP>:8000`, Task 5·6·7의 완성된 프론트

사전 요구: Android Studio + JDK 17 (Capacitor 요구 버전은 공식 문서 확인).

- [ ] **Step 1: 초기화** (`frontend/`, PowerShell)

```powershell
npm install @capacitor/android
npx cap init "방울이" "com.bangwoolee.app" --web-dir dist
npm run build
npx cap add android
```

⚠️ appId `com.bangwoolee.app`은 임시 — 팀 확정값이 있으면 이 시점에 반영 (스토어 등록 후 변경 불가).

- [ ] **Step 2: HTTP 통신 설정** — `frontend/capacitor.config.json`을 다음으로 교체:

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

⚠️ 검증 필요 (설계 §12-2): 실기기에서 API 호출이 mixed content로 차단되면 대안 —
`android/app/src/main/res/xml/network_security_config.xml` 생성:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false"><!-- Elastic IP --></domain>
    </domain-config>
</network-security-config>
```
후 AndroidManifest `<application>`에 `android:networkSecurityConfig="@xml/network_security_config"` 추가.

- [ ] **Step 3: 카메라 권한** — `frontend/android/app/src/main/AndroidManifest.xml`의 `<manifest>` 안에 추가 (@capacitor/camera 공식 문서 Android 섹션 기준):

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

- [ ] **Step 4: APK 빌드**

```powershell
npx cap sync android
cd android; .\gradlew assembleDebug
```
Expected: `BUILD SUCCESSFUL`, 산출물 `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

- [ ] **Step 5: 실기기 E2E (최종 완료 기준)** — USB 디버깅 켠 Android 기기에 `adb install app-debug.apk` (또는 Android Studio 실행). 확인 항목:
  1. 앱 실행 → 카메라 권한 요청 → 계량기 사진 촬영
  2. EC2 서버 추론 → 인식값 확인 UI → 저장
  3. 흐린 사진으로 수동 입력 폴백 동작
  4. 이력 조회, 지역 설정 변경
  5. 앱 재실행 후 device_id 유지(이력 그대로)

- [ ] **Step 6: README 갱신 + 커밋** — README에 "프론트 개발(`npm run dev`)·APK 빌드 절차" 섹션 추가.

```powershell
cd ..\..; git add frontend/ README.md; git commit -m "feat: Capacitor Android 래핑 및 APK 빌드 구성"
git push origin feature_app_merge
```

---

## 최종 체크리스트 (전체 완료 선언 전)

- [ ] `uv run pytest` 전체 통과
- [ ] `npm run build` 통과
- [ ] 로컬 E2E (Task 6·7 검증 항목)
- [ ] `curl http://<Elastic IP>:8000/health` + EC2 재부팅 후 재확인
- [ ] 실기기 E2E (Task 9 Step 5의 5개 항목)
- [ ] HEIC 파일 1장으로 스캔 성공 확인 (아이폰 사진 대비 — 백엔드 pillow-heif 지원 확인용)
- [ ] `docs/deployment-guide.md`·README 갱신 완료
- [ ] dev 머지는 사용자 승인 후 진행 (임의 머지 금지)
