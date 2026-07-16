// 매일 검침 로컬 알림의 예약 계산과 플러그인 경계를 검증하는 테스트
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  REMINDER_DAYS,
  REMINDER_KIND,
  buildReminderNotifications,
  createNotificationService,
} from '../src/notifications.js'

function createPlugin({ permission = 'granted', pending = [], scheduleError } = {}) {
  const calls = { cancel: [], requestPermissions: 0, schedule: [] }
  let listener

  return {
    calls,
    async checkPermissions() {
      return { display: permission }
    },
    async requestPermissions() {
      calls.requestPermissions += 1
      return { display: permission }
    },
    async getPending() {
      return { notifications: pending }
    },
    async cancel(payload) {
      calls.cancel.push(payload)
    },
    async schedule(payload) {
      calls.schedule.push(payload)
      if (scheduleError && calls.schedule.length === 1) throw scheduleError
    },
    async addListener(_eventName, callback) {
      listener = callback
      return { remove: async () => {} }
    },
    performAction(extra) {
      listener?.({ notification: { extra } })
    },
  }
}

test('19시에 20시 알림을 만들면 오늘부터 60일을 예약한다', () => {
  const now = new Date(2026, 6, 16, 19, 0)
  const notifications = buildReminderNotifications({
    time: '20:00',
    lastReadingDate: '2026-07-15',
    now,
  })

  assert.equal(notifications.length, REMINDER_DAYS)
  assert.equal(notifications[0].schedule.at.getTime(), new Date(2026, 6, 16, 20, 0).getTime())
  assert.equal(notifications.at(-1).schedule.at.getTime(), new Date(2026, 8, 13, 20, 0).getTime())
  assert.equal(new Set(notifications.map(({ id }) => id)).size, REMINDER_DAYS)
  assert.ok(notifications.every(({ title, body }) => (
    title === '방울이가 마를 것 같아요!' && body === '오늘의 수도 계량기를 검침해 주세요.'
  )))
  assert.ok(notifications.every(({ extra }) => (
    extra.kind === REMINDER_KIND && extra.route === 'camera'
  )))
})

test('오늘 검침했거나 오늘 알림 시각이 지났으면 내일부터 예약한다', () => {
  const readToday = buildReminderNotifications({
    time: '20:00',
    lastReadingDate: '2026-07-16',
    now: new Date(2026, 6, 16, 19, 0),
  })
  const timePassed = buildReminderNotifications({
    time: '20:00',
    lastReadingDate: '2026-07-15',
    now: new Date(2026, 6, 16, 20, 1),
  })

  const tomorrow = new Date(2026, 6, 17, 20, 0).getTime()
  assert.equal(readToday[0].schedule.at.getTime(), tomorrow)
  assert.equal(timePassed[0].schedule.at.getTime(), tomorrow)
})

test('권한이 거절되면 예약하지 않고 비활성 사유를 반환한다', async () => {
  const plugin = createPlugin({ permission: 'denied' })
  const service = createNotificationService({ plugin, isNative: true })

  const result = await service.enable({ time: '20:00', lastReadingDate: '2026-07-15' })

  assert.deepEqual(result, { enabled: false, reason: 'permission-denied' })
  assert.equal(plugin.calls.requestPermissions, 1)
  assert.equal(plugin.calls.schedule.length, 0)
  assert.equal(plugin.calls.cancel.length, 0)
})

test('비활성화하면 이 어댑터가 소유한 알림만 취소한다', async () => {
  const owned = { id: 1, extra: { kind: REMINDER_KIND } }
  const foreign = { id: 2, extra: { kind: 'another-feature' } }
  const plugin = createPlugin({ pending: [owned, foreign] })
  const service = createNotificationService({ plugin, isNative: true })

  await service.disable()

  assert.deepEqual(plugin.calls.cancel, [{ notifications: [owned] }])
})

test('새 예약이 실패하면 취소했던 소유 알림을 복원하고 오류를 다시 던진다', async () => {
  const error = new Error('schedule failed')
  const previous = { id: 1, extra: { kind: REMINDER_KIND } }
  const plugin = createPlugin({ pending: [previous], scheduleError: error })
  const service = createNotificationService({ plugin, isNative: true })

  await assert.rejects(
    service.refresh({ time: '20:00', lastReadingDate: '2026-07-15' }),
    error,
  )
  assert.deepEqual(plugin.calls.cancel, [{ notifications: [previous] }])
  assert.equal(plugin.calls.schedule.length, 2)
  assert.deepEqual(plugin.calls.schedule[1], { notifications: [previous] })
})

test('알림 액션 중 camera 경로만 콜백을 실행한다', async () => {
  const plugin = createPlugin()
  const service = createNotificationService({ plugin, isNative: true })
  let opened = 0

  await service.listenForActions(() => { opened += 1 })
  plugin.performAction({ route: 'settings' })
  plugin.performAction({ route: 'camera' })

  assert.equal(opened, 1)
})

test('웹에서는 모든 서비스 동작이 플러그인을 호출하지 않는 성공 no-op이다', async () => {
  const plugin = new Proxy({}, {
    get() {
      throw new Error('웹에서 플러그인을 호출하면 안 됩니다')
    },
  })
  const service = createNotificationService({ plugin, isNative: false })
  const settings = { time: '20:00', lastReadingDate: '2026-07-15' }

  assert.deepEqual(await service.enable(settings), { enabled: true })
  assert.deepEqual(await service.refresh(settings), { enabled: true })
  assert.equal(await service.disable(), undefined)
  const listener = await service.listenForActions(() => {})
  assert.equal(typeof listener.remove, 'function')
  assert.equal(await listener.remove(), undefined)
})
