// 실제 검침 날짜를 기준으로 연속 기록 일수를 계산하는 유틸리티
function seoulDateKeyFromTimestamp(timestamp) {
  const date = new Date(timestamp)
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function previousDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

export function calculateReadingStreak(history, todayReading) {
  const dates = new Set()
  for (const item of history) {
    dates.add(item.start_label)
    dates.add(item.end_label)
  }
  if (todayReading?.recorded_at) {
    dates.add(seoulDateKeyFromTimestamp(todayReading.recorded_at))
  }
  if (dates.size === 0) return 0

  let cursor = [...dates].sort().at(-1)
  let streak = 0
  while (dates.has(cursor)) {
    streak += 1
    cursor = previousDateKey(cursor)
  }
  return streak
}
