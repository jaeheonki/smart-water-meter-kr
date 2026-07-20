// 이전 검침값과 서울 날짜 안내 문구를 검증하는 테스트
import test from 'node:test'
import assert from 'node:assert/strict'
import { formatPreviousReading } from '../src/readingContext.js'

test('이전 검침을 서울 날짜와 소수점 세 자리로 표시한다', () => {
  assert.equal(formatPreviousReading({
    reading_m3: 225.654,
    recorded_at: '2026-07-19T16:00:00',
  }), '이전 검침 225.654㎥ · 7/20')
})

test('연도 경계를 서울 날짜로 표시한다', () => {
  assert.equal(formatPreviousReading({
    reading_m3: 1000,
    recorded_at: '2026-12-31T16:00:00Z',
  }), '이전 검침 1000.000㎥ · 1/1')
})

test('이전 기록이 없으면 빈 상태를 표시한다', () => {
  assert.equal(formatPreviousReading(null), '이전 검침 기록이 없습니다')
})
