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
export async function saveReading({ reading_m3, confidence = null, input_mode, reset_baseline = false }) {
  return request("/meter/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reading_m3, confidence, input_mode, reset_baseline }),
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
