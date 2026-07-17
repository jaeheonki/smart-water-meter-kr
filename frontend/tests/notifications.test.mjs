// 매일 검침 로컬 알림의 예약 계산과 플러그인 경계를 검증하는 테스트
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  REMINDER_DAYS,
  REMINDER_KIND,
  buildReminderNotifications,
  createNotificationService,
  localDateKeyFromUtcTimestamp,
} from '../src/notifications.js'

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('앱은 알림 어댑터로 시작 refresh와 action listener cleanup을 수행한다', () => {
  assert.doesNotMatch(app, /@capacitor\/local-notifications/)
  assert.match(app, /notificationService\.refresh\(\{[\s\S]*time: st\.notificationTime,[\s\S]*lastReadingDate: st\.lastReadingDate,[\s\S]*\}\)\.then\(\(result\) => \{[\s\S]*if \(!result\.enabled\) patch\(\{ notificationEnabled: false \}\)[\s\S]*\}\)\.catch\(\(\) => \{\}\)/)
  assert.match(app, /notificationService\.listenForActions\(\(\) => nav\(['"]camera['"]\)\)/)
  assert.match(app, /return \(\) => \{[\s\S]*void listener\??\.remove\(\)[\s\S]*\}/)
})

test('action listener 등록 실패를 처리한다', () => {
  assert.match(app, /notificationService\.listenForActions\([\s\S]*?\.then\([\s\S]*?\)\s*\.catch\(\(\) => \{\}\)/)
})

test('cleanup 전에 등록된 action listener 제거 실패를 처리한다', () => {
  assert.match(app, /if \(disposed\) void handle\.remove\(\)\.catch\(\(\) => \{\}\)/)
})

test('일반 action listener cleanup 제거 실패를 처리한다', () => {
  assert.match(app, /if \(listener\) void listener\.remove\(\)\.catch\(\(\) => \{\}\)/)
})

test('검침 완료 후 알림 refresh 실패를 처리한다', () => {
  assert.match(app, /notificationService\.refresh\(\{ time: st\.notificationTime, lastReadingDate \}\)\.catch\(\(\) => \{\}\)/)
})

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

test('같은 날짜와 시각의 새 예약 세대는 이전 세대와 ID가 겹치지 않는다', () => {
  const settings = {
    time: '20:00',
    lastReadingDate: '2026-07-15',
    now: new Date(2026, 6, 16, 19, 0),
  }
  const previous = buildReminderNotifications({ ...settings, generation: 1 })
  const next = buildReminderNotifications({ ...settings, generation: 2 })
  const previousIds = new Set(previous.map(({ id }) => id))

  assert.ok(next.every(({ id }) => !previousIds.has(id)))
})

test('시각 1분 감소와 세대 1 증가가 ID를 상쇄하지 않고 signed 32-bit 범위를 지킨다', () => {
  const settings = {
    lastReadingDate: '2026-07-15',
    now: new Date(2026, 6, 16, 18, 0),
  }
  const previous = buildReminderNotifications({ ...settings, time: '20:00', generation: 1 })
  const next = buildReminderNotifications({ ...settings, time: '19:59', generation: 2 })
  const previousIds = new Set(previous.map(({ id }) => id))
  const allIds = [...previous, ...next].map(({ id }) => id)
  const minuteBuckets = Math.floor((2147483647 - 100000000 + 1) / (REMINDER_DAYS * 16))
  const lastBucketAt = new Date((minuteBuckets - 1) * 60000)
  const boundary = buildReminderNotifications({
    time: `${String(lastBucketAt.getHours()).padStart(2, '0')}:${String(lastBucketAt.getMinutes()).padStart(2, '0')}`,
    lastReadingDate: null,
    now: new Date(lastBucketAt.getTime() - 60000),
    generation: 15,
  })

  assert.ok(next.every(({ id }) => !previousIds.has(id)))
  assert.ok([...allIds, ...boundary.map(({ id }) => id)]
    .every((id) => Number.isInteger(id) && id > 0 && id <= 2147483647))
})

test('서비스 재시작 뒤에도 pending ID와 다른 세대를 예약하고 이전 세대만 취소한다', async () => {
  let pending = []
  const schedules = []
  const plugin = {
    async checkPermissions() { return { display: 'granted' } },
    async getPending() { return { notifications: [...pending] } },
    async schedule({ notifications }) {
      schedules.push(notifications)
      pending.push(...notifications)
    },
    async cancel({ notifications }) {
      const ids = new Set(notifications.map(({ id }) => id))
      pending = pending.filter(({ id }) => !ids.has(id))
    },
  }
  const settings = { time: '23:59', lastReadingDate: '2026-07-15' }

  await createNotificationService({ plugin, isNative: true }).refresh(settings)
  await createNotificationService({ plugin, isNative: true }).refresh(settings)

  const firstIds = new Set(schedules[0].map(({ id }) => id))
  const secondIds = schedules[1].map(({ id }) => id)
  assert.ok(secondIds.every((id) => !firstIds.has(id)))
  assert.deepEqual(pending.map(({ id }) => id), secondIds)
})

test('naive UTC 시각을 서울 사용자 로컬 날짜로 변환한다', () => {
  const originalTimezone = process.env.TZ
  process.env.TZ = 'Asia/Seoul'
  try {
    assert.equal(
      localDateKeyFromUtcTimestamp('2026-07-16T15:30:00'),
      '2026-07-17',
    )
  } finally {
    process.env.TZ = originalTimezone
  }
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

test('refresh에서 권한이 사후 거절되면 기존 owned 알림을 취소한다', async () => {
  const owned = { id: 1, extra: { kind: REMINDER_KIND } }
  const foreign = { id: 2, extra: { kind: 'another-feature' } }
  const plugin = createPlugin({ permission: 'denied', pending: [owned, foreign] })
  const service = createNotificationService({ plugin, isNative: true })

  const result = await service.refresh({ time: '20:00', lastReadingDate: '2026-07-15' })

  assert.deepEqual(result, { enabled: false, reason: 'permission-denied' })
  assert.deepEqual(plugin.calls.cancel, [{ notifications: [owned] }])
})

test('비활성화하면 이 어댑터가 소유한 알림만 취소한다', async () => {
  const owned = { id: 1, extra: { kind: REMINDER_KIND } }
  const foreign = { id: 2, extra: { kind: 'another-feature' } }
  const plugin = createPlugin({ pending: [owned, foreign] })
  const service = createNotificationService({ plugin, isNative: true })

  await service.disable()

  assert.deepEqual(plugin.calls.cancel, [{ notifications: [owned] }])
})

test('진행 중 refresh 뒤에 요청한 disable은 마지막에 실행되어 새 알림도 제거한다', async () => {
  const old = { id: 1, extra: { kind: REMINDER_KIND } }
  let pending = [old]
  let releaseSchedule
  let markScheduleStarted
  const scheduleGate = new Promise((resolve) => { releaseSchedule = resolve })
  const scheduleStarted = new Promise((resolve) => { markScheduleStarted = resolve })
  const plugin = {
    async checkPermissions() { return { display: 'granted' } },
    async getPending() { return { notifications: [...pending] } },
    async schedule({ notifications }) {
      markScheduleStarted()
      await scheduleGate
      pending.push(...notifications)
    },
    async cancel({ notifications }) {
      const ids = new Set(notifications.map(({ id }) => id))
      pending = pending.filter(({ id }) => !ids.has(id))
    },
  }
  const service = createNotificationService({ plugin, isNative: true })

  const refreshing = service.refresh({ time: '20:00', lastReadingDate: '2026-07-15' })
  await scheduleStarted
  const disabling = service.disable()
  releaseSchedule()
  await Promise.all([refreshing, disabling])

  assert.deepEqual(pending, [])
})

test('새 예약이 계속 실패해도 기존 owned 알림을 취소하지 않는다', async () => {
  const error = new Error('schedule failed')
  const previous = { id: 1, extra: { kind: REMINDER_KIND } }
  const plugin = createPlugin({ pending: [previous], scheduleError: error })
  const service = createNotificationService({ plugin, isNative: true })

  await assert.rejects(
    service.refresh({ time: '20:00', lastReadingDate: '2026-07-15' }),
    error,
  )
  assert.deepEqual(plugin.calls.cancel, [])
  assert.equal(plugin.calls.schedule.length, 1)
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
