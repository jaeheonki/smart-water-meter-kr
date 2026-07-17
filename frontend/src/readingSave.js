// 오래된 오늘 검침 상태를 서버와 다시 맞춰 저장 방식을 결정하는 도우미
export async function persistReading({
  todayReading,
  payload,
  saveReading,
  updateTodayReading,
}) {
  if (todayReading) {
    return { result: await updateTodayReading(payload), updated: true }
  }

  return { result: await saveReading(payload), updated: false }
}
