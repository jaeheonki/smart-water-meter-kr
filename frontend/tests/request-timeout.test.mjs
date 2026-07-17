// fetch 요청 제한 시간과 정상 응답 보존을 검증하는 테스트
import test from 'node:test'
import assert from 'node:assert/strict'

import { requestWithTimeout } from '../src/requestTimeout.js'

test('제한 시간을 넘긴 요청은 TimeoutError로 중단한다', async () => {
  const waitingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

  await assert.rejects(
    requestWithTimeout('/meter/scan', {}, 20, waitingFetch),
    (error) => error?.name === 'TimeoutError',
  )
})

test('제한 시간 전에 끝난 응답은 그대로 반환한다', async () => {
  const response = { ok: true }
  const immediateFetch = async () => response

  assert.equal(await requestWithTimeout('/health', {}, 20, immediateFetch), response)
})
