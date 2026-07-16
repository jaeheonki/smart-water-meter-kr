// 매일 검침 로컬 알림의 권한과 예약 및 앱 동작을 관리하는 어댑터
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

export const REMINDER_DAYS = 60
export const REMINDER_KIND = 'daily-meter-reminder'

export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildReminderNotifications({ time, lastReadingDate, now = new Date() }) {
  const [hour, minute] = time.split(':').map(Number)
  const first = new Date(now)
  first.setHours(hour, minute, 0, 0)
  if (first <= now || localDateKey(first) === lastReadingDate) first.setDate(first.getDate() + 1)

  return Array.from({ length: REMINDER_DAYS }, (_, offset) => {
    const at = new Date(first)
    at.setDate(first.getDate() + offset)
    return {
      id: 100000000 + Number(localDateKey(at).replaceAll('-', '')),
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
  const owned = (notification) => notification.extra?.kind === REMINDER_KIND
  const pendingOwned = async () => (await plugin.getPending()).notifications.filter(owned)
  const cancelOwned = async (notifications) => {
    if (notifications.length) await plugin.cancel({ notifications })
  }

  const replace = async ({ time, lastReadingDate, requestPermission }) => {
    if (!isNative) return { enabled: true }
    let permission = await plugin.checkPermissions()
    if (permission.display !== 'granted' && requestPermission) permission = await plugin.requestPermissions()
    if (permission.display !== 'granted') return { enabled: false, reason: 'permission-denied' }

    const previous = await pendingOwned()
    await cancelOwned(previous)
    try {
      await plugin.schedule({ notifications: buildReminderNotifications({ time, lastReadingDate }) })
      return { enabled: true }
    } catch (error) {
      if (previous.length) await plugin.schedule({ notifications: previous })
      throw error
    }
  }

  return {
    enable: (settings) => replace({ ...settings, requestPermission: true }),
    refresh: (settings) => replace({ ...settings, requestPermission: false }),
    disable: async () => {
      if (isNative) await cancelOwned(await pendingOwned())
    },
    listenForActions: async (openCamera) => {
      if (!isNative) return { remove: async () => {} }
      return plugin.addListener('localNotificationActionPerformed', (event) => {
        if (event.notification.extra?.route === 'camera') openCamera()
      })
    },
  }
}

export const notificationService = createNotificationService()
