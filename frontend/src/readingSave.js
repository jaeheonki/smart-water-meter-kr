// 오래된 오늘 검침 상태를 서버와 다시 맞춰 저장 방식을 결정하는 도우미
export async function persistReading({
  todayReading,
  payload,
  saveReading,
  updateTodayReading,
  getTodayReading,
}) {
  if (todayReading) {
    return { result: await updateTodayReading(payload), updated: true }
  }

  try {
    return { result: await saveReading(payload), updated: false }
  } catch (error) {
    if (error?.status !== 409) throw error
    const current = await getTodayReading()
    if (!current) throw error
    return { result: await updateTodayReading(payload), updated: true }
  }
}
