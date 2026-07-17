// 신규 검침과 오늘 기록 수정의 저장 경로 분리를 검증하는 테스트
import test from 'node:test'
import assert from 'node:assert/strict'

import { persistReading } from '../src/readingSave.js'

const payload = { reading_m3: 4734.918, confidence: null, input_mode: 'manual' }

test('오늘 기록을 이미 알고 있으면 곧바로 수정 저장한다', async () => {
  const events = []
  const updatedResult = { reading_m3: payload.reading_m3, updated: true }

  const saved = await persistReading({
    todayReading: { reading_m3: 100 },
    payload,
    saveReading: async () => { events.push('post') },
    updateTodayReading: async (value) => { events.push(['put', value]); return updatedResult },
  })

  assert.deepEqual(events, [['put', payload]])
  assert.deepEqual(saved, { result: updatedResult, updated: true })
})

test('신규 저장 409는 오늘 기록을 자동 수정하지 않는다', async () => {
  const events = []
  const conflict = Object.assign(new Error('conflict'), { status: 409 })

  await assert.rejects(
    persistReading({
      todayReading: null,
      payload,
      saveReading: async () => { events.push('post'); throw conflict },
      updateTodayReading: async (value) => { events.push(['put', value]) },
    }),
    (error) => error === conflict,
  )

  assert.deepEqual(events, ['post'])
})

test('신규 저장 오류는 자동 수정하지 않는다', async () => {
  const failure = Object.assign(new Error('unavailable'), { status: 503 })

  await assert.rejects(
    persistReading({
      todayReading: null,
      payload,
      saveReading: async () => { throw failure },
      updateTodayReading: async () => { throw new Error('must not update') },
    }),
    (error) => error === failure,
  )
})
