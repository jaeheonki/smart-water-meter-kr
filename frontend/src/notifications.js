// 매일 검침 로컬 알림의 권한과 예약 및 앱 동작을 관리하는 어댑터
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

export const REMINDER_DAYS = 60
export const REMINDER_KIND = 'daily-meter-reminder'
const GENERATION_SLOTS = 16
const MAX_NOTIFICATION_ID = 2147483647
const NOTIFICATION_ID_START = 100000000
const MINUTE_BUCKETS = Math.floor(
  (MAX_NOTIFICATION_ID - NOTIFICATION_ID_START + 1) / (REMINDER_DAYS * GENERATION_SLOTS),
)

export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function localDateKeyFromUtcTimestamp(recordedAt) {
  const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/.test(recordedAt) ? recordedAt : `${recordedAt}Z`
  return localDateKey(new Date(timestamp))
}

export function buildReminderNotifications({ time, lastReadingDate, now = new Date(), generation = 0 }) {
  const [hour, minute] = time.split(':').map(Number)
  const first = new Date(now)
  first.setHours(hour, minute, 0, 0)
  if (first <= now || localDateKey(first) === lastReadingDate) first.setDate(first.getDate() + 1)
  const minuteBucket = Math.floor(first.getTime() / 60000) % MINUTE_BUCKETS
  const generationSlot = generation % GENERATION_SLOTS
  const firstId = NOTIFICATION_ID_START
    + (minuteBucket * GENERATION_SLOTS + generationSlot) * REMINDER_DAYS

  return Array.from({ length: REMINDER_DAYS }, (_, offset) => {
    const at = new Date(first)
    at.setDate(first.getDate() + offset)
    return {
      id: firstId + offset,
      title: '방울이가 마를 것 같아요!',
      body: '오늘의 수도 계량기를 검침해 주세요.',
      schedule: { at, allowWhileIdle: false },
      autoCancel: true,
      extra: { kind: REMINDER_KIND, route: 'camera' },
    }
  })
}

export function createNotificationService({
  plugin = LocalNotifications,
  isNative = Capacitor.isNativePlatform(),
} = {}) {
  let queue = Promise.resolve()
  let generation = 0
  const owned = (notification) => notification.extra?.kind === REMINDER_KIND
  const pendingOwned = async () => (await plugin.getPending()).notifications.filter(owned)
  const cancelOwned = async (notifications) => {
    if (notifications.length) await plugin.cancel({ notifications })
  }

  const replace = async ({ time, lastReadingDate, requestPermission }) => {
    if (!isNative) return { enabled: true }
    let permission = await plugin.checkPermissions()
    if (permission.display !== 'granted' && requestPermission) permission = await plugin.requestPermissions()
    if (permission.display !== 'granted') {
      await cancelOwned(await pendingOwned())
      return { enabled: false, reason: 'permission-denied' }
    }

    const previous = await pendingOwned()
    const previousIds = new Set(previous.map(({ id }) => id))
    let notifications
    for (let attempt = 0; attempt < GENERATION_SLOTS; attempt += 1) {
      const candidate = buildReminderNotifications({
        time,
        lastReadingDate,
        generation: ++generation,
      })
      if (candidate.every(({ id }) => !previousIds.has(id))) {
        notifications = candidate
        break
      }
    }
    if (!notifications) throw new Error('No notification ID generation slot is available')
    await plugin.schedule({ notifications })
    await cancelOwned(previous)
    return { enabled: true }
  }

  const serialize = (operation) => {
    const result = queue.then(operation)
    queue = result.catch(() => {})
    return result
  }

  return {
    enable: (settings) => serialize(() => replace({ ...settings, requestPermission: true })),
    refresh: (settings) => serialize(() => replace({ ...settings, requestPermission: false })),
    disable: () => serialize(async () => {
      if (isNative) await cancelOwned(await pendingOwned())
    }),
    listenForActions: async (openCamera) => {
      if (!isNative) return { remove: async () => {} }
      return plugin.addListener('localNotificationActionPerformed', (event) => {
        if (event.notification.extra?.route === 'camera') openCamera()
      })
    },
  }
}

export const notificationService = createNotificationService()
