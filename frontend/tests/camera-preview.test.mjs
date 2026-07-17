// 인앱 카메라 미리보기 컨트롤러의 네이티브 동작과 정리를 검증하는 테스트
import assert from 'node:assert/strict'
import test from 'node:test'

import { createCameraPreviewController } from '../src/camera.js'

test('네이티브 미리보기는 후면 카메라를 시작하고 촬영과 torch를 제어한 뒤 정리한다', async () => {
  const calls = []
  const preview = {
    start: async (options) => calls.push(['start', options]),
    getSupportedFlashModes: async () => ({ result: ['off', 'torch'] }),
    setFlashMode: async (options) => calls.push(['flash', options]),
    capture: async (options) => {
      calls.push(['capture', options])
      return { value: 'aGVsbG8=' }
    },
    stop: async () => calls.push(['stop']),
  }
  const controller = createCameraPreviewController({ preview, isNative: () => true })

  assert.deepEqual(await controller.start('meter-camera-preview'), { started: true, flashSupported: true })
  assert.deepEqual(calls[0], ['start', {
    parent: 'meter-camera-preview',
    position: 'rear',
    toBack: true,
    disableAudio: true,
  }])
  assert.deepEqual(await controller.toggleFlash(), { flashOn: true })
  const file = await controller.capture()
  assert.equal(file.name, 'meter.jpg')
  assert.equal(file.type, 'image/jpeg')
  assert.equal(await file.text(), 'hello')
  assert.deepEqual(calls.at(-1), ['capture', { quality: 90 }])

  await controller.stop()

  assert.deepEqual(calls.at(-2), ['flash', { flashMode: 'off' }])
  assert.deepEqual(calls.at(-1), ['stop'])
})

test('플래시 미지원 기기는 촬영을 유지하고 flash 호출을 생략한다', async () => {
  const calls = []
  const preview = {
    start: async () => calls.push('start'),
    getSupportedFlashModes: async () => ({ result: ['off', 'auto'] }),
    setFlashMode: async () => calls.push('flash'),
    stop: async () => calls.push('stop'),
  }
  const controller = createCameraPreviewController({ preview, isNative: () => true })

  assert.deepEqual(await controller.start('meter-camera-preview'), { started: true, flashSupported: false })
  assert.deepEqual(await controller.toggleFlash(), { flashOn: false })
  await controller.stop()

  assert.deepEqual(calls, ['start', 'stop'])
})

test('웹에서는 네이티브 미리보기 플러그인을 호출하지 않는다', async () => {
  const preview = {
    start: async () => { throw new Error('native preview must not start') },
  }
  const controller = createCameraPreviewController({ preview, isNative: () => false })

  assert.equal(controller.isAvailable(), false)
  assert.deepEqual(await controller.start('meter-camera-preview'), { started: false, flashSupported: false })
  await controller.stop()
})
