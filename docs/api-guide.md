# Smart Water Meter API 사용 가이드

Base URL: `http://13.53.120.64:8000`

Swagger UI (브라우저에서 직접 테스트 가능): `http://13.53.120.64:8000/docs`

---

## 폴더 구조

| 폴더 | 역할 | EC2 배포 |
|---|---|---|
| `src/api/` | 실제 서버 코드. FastAPI 엔드포인트, DB, 스키마 | 포함 |
| `tests/api/` | `src/api/`가 올바르게 동작하는지 검증하는 코드 | 미포함 |

---

## 공통 헤더

모든 요청(GET /regions 제외)에 아래 헤더 포함.

```
X-Device-ID: <기기 UUID>
```

앱 첫 실행 시 UUID를 생성해 로컬에 저장하고 매 요청마다 붙인다.

---

## 엔드포인트

### GET /regions
지역 목록 조회. 지역 선택 UI 구성에 사용.

**응답**
```json
{
  "regions": ["seoul", "busan", "incheon", ...]
}
```

---

### GET /settings
현재 기기의 지역 설정 조회.

**응답**
```json
{ "region": "seoul" }   // 설정된 경우
{ "region": null }      // 미설정
```

---

### PUT /settings
지역 설정 저장.

**요청**
```json
{ "region": "seoul" }
```

**응답**
```json
{ "region": "seoul" }
```

**에러**
- `400` — X-Device-ID 헤더 없음
- `422` — 지원하지 않는 지역 코드

---

### POST /meter/scan
이미지를 YOLO로 분석해 검침값 인식. **DB 저장 안 함.**
앱에서 사용자가 결과 확인 후 /meter/manual 호출.

**요청** `multipart/form-data`
```
image: <이미지 파일>
```

**응답 (성공)**
```json
{
  "success": true,
  "reading_m3": 234.918,
  "confidence": 0.91
}
```

**응답 (인식 실패)**
```json
{
  "success": false,
  "reading_m3": null,
  "confidence": null
}
```

---

### POST /meter/manual
검침값 DB 저장 + 요금 계산.
스캔 확정(input_mode: "auto") 또는 수동 입력(input_mode: "manual") 모두 이 엔드포인트 사용.
기기별 한국 시간 기준 하루에 한 건만 신규 저장할 수 있으며, 오늘 기록이 있으면 `PUT /meter/today`로 수정한다.

**요청**
```json
{
  "reading_m3": 12345.0,
  "confidence": 0.91,
  "input_mode": "auto"
}
```
수동 입력 시:
```json
{
  "reading_m3": 12345.0,
  "input_mode": "manual"
}
```

계량기 교체 기준점 저장 시:
```json
{
  "reading_m3": 20.0,
  "input_mode": "manual",
  "reset_baseline": true
}
```

`reset_baseline`은 일반 저장이 이전값 이하라서 422가 발생한 뒤, 사용자가 계량기 교체를 명시적으로 확인한 경우에만 사용한다. 기존 이력은 보존되고 새 값부터 계산 기준이 다시 시작된다.

**응답 (첫 검침 또는 지역 미설정)**
```json
{
  "reading_m3": 12345.0,
  "recorded_at": "2026-06-24T06:00:00",
  "first_reading": true,
  "usage_m3": null,
  "prev_reading_m3": null,
  "bill": null,
  "impact": null
}
```

**응답 (두 번째 검침 이후)**
```json
{
  "reading_m3": 12345.0,
  "recorded_at": "2026-06-24T06:00:00",
  "first_reading": false,
  "usage_m3": 23.0,
  "prev_reading_m3": 12322.0,
  "bill": {
    "water": 5000,
    "sewage": 3000,
    "water_use_fee": 500,
    "vat": 850,
    "total": 9350
  },
  "impact": {
    "energy_kwh": 12.3,
    "co2_kg": 5.6
  }
}
```

**에러**
- `400` — X-Device-ID 헤더 없음
- `409` — 한국 시간 기준 오늘 검침 기록이 이미 있음
- `422` — 일반 저장의 현재 검침값이 이전값보다 작거나 같음

---

### GET /meter/today
한국 시간 기준 현재 기기의 오늘 검침을 반환한다. 기록이 없으면 `null`이다.

**응답**
```json
{
  "reading_m3": 234.918,
  "confidence": 0.91,
  "input_mode": "auto",
  "recorded_at": "2026-07-17T06:00:00",
  "is_baseline": false
}
```

---

### PUT /meter/today
오늘 검침 행을 새 행 추가 없이 수정한다. 요청 형식은 `POST /meter/manual`과 같고, 계산은 오늘 행이 아닌 직전 날짜의 검침을 기준으로 다시 수행한다. 응답의 `updated`는 `true`다.

오늘 기록이 없으면 `404`, 직전 날짜 검침보다 작거나 같은 일반 수정은 `422`를 반환한다. 계량기 교체가 확인된 경우 `reset_baseline: true`를 사용할 수 있다.

---

### GET /history
기기의 전체 검침 이력을 구간별로 반환. 최신 구간이 먼저.

**응답**
```json
[
  {
    "start_label": "2026-05-14",
    "end_label": "2026-06-14",
    "usage_m3": 23.0,
    "bill_total": 9350,
    "co2_kg": 5.6
  },
  ...
]
```

검침 2개 미만이거나 지역 미설정이면 빈 배열 반환.

---

### GET /history/period
특정 기간의 이력만 조회.

**쿼리 파라미터**
- `start`: 시작일 (YYYY-MM-DD)
- `end`: 종료일 (YYYY-MM-DD)

**예시**
```
GET /history/period?start=2026-01-01&end=2026-06-30
```

**응답** — /history와 동일한 형식

**에러**
- `422` — YYYY-MM-DD 형식이 아닌 경우

---

### GET /history/replacements

현재 기기의 계량기 교체 기준점 기록을 최신순으로 조회한다.

**응답**
```json
[
  {
    "replaced_at": "2026-07-16T08:00:00",
    "previous_reading_m3": 1020.0,
    "baseline_reading_m3": 20.0,
    "input_mode": "manual"
  }
]
```

교체 기록이 없으면 빈 배열을 반환한다.

---

### DELETE /device-data

현재 `X-Device-ID`의 검침 이력과 지역 설정을 삭제한다. 다른 기기의 데이터는 유지한다.

**응답**

성공 시 본문 없이 `204 No Content`를 반환한다. 반복 호출도 `204`다. 프론트는 서버 삭제 성공 뒤에만 알림 예약과 localStorage를 삭제한다.

---

## 앱 흐름 예시

```
1. 앱 최초 실행
   UUID 생성 → 로컬 저장
   GET /regions → 지역 선택 UI
   PUT /settings {"region": "seoul"}

2. 검침
   POST /meter/scan (카메라 사진)
   → 인식 결과 사용자에게 표시
   → 확인/수정 후
   POST /meter/manual {"reading_m3": ..., "input_mode": "auto"}
   → 요금 결과 화면 표시

3. 이력
   GET /history → 월별 사용량 그래프

4. 계량기 교체
   일반 POST /meter/manual → 422
   → 사용자에게 값과 교체 여부 확인
   → POST /meter/manual {"reset_baseline": true}
   → 기존 이력 보존, 다음 검침부터 계산 재개

5. 전체 초기화
   DELETE /device-data → 204
   → 로컬 알림 취소와 앱 상태·device_id 삭제
```
