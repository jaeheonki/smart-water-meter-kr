// fetch 요청에 선택적 제한 시간을 적용하는 공통 도우미
export async function requestWithTimeout(url, options = {}, timeoutMs = 0, fetchImpl = fetch) {
  if (!timeoutMs) return fetchImpl(url, options)

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new DOMException('요청 시간이 초과되었습니다.', 'TimeoutError'))
  }, timeoutMs)

  try {
    return await fetchImpl(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
