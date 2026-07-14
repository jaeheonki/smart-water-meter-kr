// 검침 이력을 리포트 기간별 리터 사용량으로 요약하는 순수 함수
const PERIOD_DAYS = { '주간': 7, '월간': 30, '연간': 365 }

function toDate(label) {
  return new Date(`${label}T00:00:00`)
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function totalLiters(items) {
  return items.reduce((sum, item) => sum + Number(item.usage_m3) * 1000, 0)
}

function summarize(current, previous = []) {
  const currentTotalLiters = totalLiters(current)
  const previousTotalLiters = totalLiters(previous)
  return {
    currentTotalLiters,
    previousTotalLiters,
    currentCount: current.length,
  }
}

export function getPreviousDateRange(from, to) {
  const start = toDate(from)
  const end = toDate(to)
  const days = Math.round((end - start) / 86400000) + 1
  const previousTo = new Date(start)
  previousTo.setDate(previousTo.getDate() - 1)
  const previousFrom = new Date(previousTo)
  previousFrom.setDate(previousFrom.getDate() - (days - 1))
  return { from: formatDate(previousFrom), to: formatDate(previousTo) }
}

export function getPeriodDateRange(period, now = new Date()) {
  const days = PERIOD_DAYS[period] || PERIOD_DAYS['월간']
  const end = new Date(now)
  end.setHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  const previous = getPreviousDateRange(formatDate(start), formatDate(end))
  return {
    from: formatDate(start),
    to: formatDate(end),
    previousFrom: previous.from,
    previousTo: previous.to,
  }
}

export function summarizeHistory(history, period, now = new Date()) {
  const range = getPeriodDateRange(period, now)

  const current = history.filter((item) => {
    return item.start_label >= range.from && item.end_label <= range.to
  })
  const previous = history.filter((item) => {
    return item.start_label >= range.previousFrom && item.end_label <= range.previousTo
  })
  return summarize(current, previous)
}

export function summarizeCustomHistory(currentHistory, previousHistory) {
  return summarize(currentHistory, previousHistory)
}
