// 오래된 오늘 검침 상태에서 저장 방식을 복구하는 계약을 검증하는 테스트
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
    getTodayReading: async () => { events.push('get') },
    updateTodayReading: async (value) => { events.push(['put', value]); return updatedResult },
  })

  assert.deepEqual(events, [['put', payload]])
  assert.deepEqual(saved, { result: updatedResult, updated: true })
})

test('신규 저장 409는 오늘 기록을 다시 확인한 뒤 같은 값을 수정 저장한다', async () => {
  const events = []
  const conflict = Object.assign(new Error('conflict'), { status: 409 })
  const updatedResult = { reading_m3: payload.reading_m3, updated: true }

  const saved = await persistReading({
    todayReading: null,
    payload,
    saveReading: async () => { events.push('post'); throw conflict },
    getTodayReading: async () => { events.push('get'); return { reading_m3: 100 } },
    updateTodayReading: async (value) => { events.push(['put', value]); return updatedResult },
  })

  assert.deepEqual(events, ['post', 'get', ['put', payload]])
  assert.deepEqual(saved, { result: updatedResult, updated: true })
})

test('409 뒤에도 오늘 기록이 없으면 원래 오류를 유지한다', async () => {
  const conflict = Object.assign(new Error('conflict'), { status: 409 })

  await assert.rejects(
    persistReading({
      todayReading: null,
      payload,
      saveReading: async () => { throw conflict },
      getTodayReading: async () => null,
      updateTodayReading: async () => { throw new Error('must not update') },
    }),
    (error) => error === conflict,
  )
})

test('409가 아닌 저장 오류는 자동 수정하지 않는다', async () => {
  const failure = Object.assign(new Error('unavailable'), { status: 503 })
  let queried = false

  await assert.rejects(
    persistReading({
      todayReading: null,
      payload,
      saveReading: async () => { throw failure },
      getTodayReading: async () => { queried = true },
      updateTodayReading: async () => { throw new Error('must not update') },
    }),
    (error) => error === failure,
  )
  assert.equal(queried, false)
})
