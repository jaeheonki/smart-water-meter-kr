# Smart Water Meter API 사용 가이드

Base URL: `http://<서버 IP>:8000`

Swagger UI (브라우저에서 직접 테스트 가능): `http://<서버 IP>:8000/docs`

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
  "reading_m3": 12345.0,
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
- `422` — 당월 검침값이 전월보다 작음

---

### GET /history
기기의 전체 검침 이력을 구간별로 반환. 최신 구간이 먼저.

**응답**
```json
[
  {
    "start_label": "2026-05",
    "end_label": "2026-06",
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
- `start`: 시작 월 (YYYY-MM)
- `end`: 종료 월 (YYYY-MM)

**예시**
```
GET /history/period?start=2026-01&end=2026-06
```

**응답** — /history와 동일한 형식

**에러**
- `422` — YYYY-MM 형식이 아닌 경우

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
```
