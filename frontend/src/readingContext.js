// 이전 검침값과 UTC 저장 시각을 입력 화면 안내 문구로 변환한다
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000

function seoulMonthDay(recordedAt) {
  const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/.test(recordedAt) ? recordedAt : `${recordedAt}Z`
  const seoul = new Date(new Date(timestamp).getTime() + SEOUL_OFFSET_MS)
  return `${seoul.getUTCMonth() + 1}/${seoul.getUTCDate()}`
}

export function formatPreviousReading(previousReading) {
  if (!previousReading) return '이전 검침 기록이 없습니다'
  return `이전 검침 ${Number(previousReading.reading_m3).toFixed(3)}㎥ · ${seoulMonthDay(previousReading.recorded_at)}`
}
