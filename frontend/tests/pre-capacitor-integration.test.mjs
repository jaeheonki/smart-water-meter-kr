// Capacitor 전환 전 핵심 프론트 연동 계약을 검증하는 테스트
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/components/SettingsScreen.jsx', import.meta.url), 'utf8')
const report = readFileSync(new URL('../src/components/ReportScreen.jsx', import.meta.url), 'utf8')
const cameraFlow = readFileSync(new URL('../src/components/CameraFlow.jsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../src/api.js', import.meta.url), 'utf8')
const replacementHistoryUrl = new URL('../src/components/ReplacementHistoryScreen.jsx', import.meta.url)
const replacementHistory = existsSync(replacementHistoryUrl) ? readFileSync(replacementHistoryUrl, 'utf8') : ''
const expectedRegions = {
  seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천', gwangju: '광주',
  daejeon: '대전', ulsan: '울산', sejong: '세종', gyeonggi: '경기', gangwon: '강원',
  chungbuk: '충북', chungnam: '충남', jeonju: '전주', yeosu: '여수', pohang: '포항',
  changwon: '창원', jeju: '제주',
}

test('기기 데이터 삭제 API는 204 응답을 JSON으로 읽지 않는다', async () => {
  const requestSource = api.match(/async function request\(path, options = \{\}\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(requestSource)

  const createRequest = new Function(
    'BASE',
    'getDeviceId',
    'ApiError',
    'fetch',
    `return (${requestSource})`,
  )
  let parsedJson = false
  const request = createRequest(
    'http://example.test',
    () => 'test-device',
    Error,
    async () => ({
      ok: true,
      status: 204,
      json: async () => { parsedJson = true; throw new Error('204 body must not be parsed') },
    }),
  )

  assert.equal(await request('/device-data', { method: 'DELETE' }), null)
  assert.equal(parsedJson, false)
  assert.match(api, /export async function deleteDeviceData\(\) \{\s*return request\(['"]\/device-data['"], \{ method: ['"]DELETE['"] \}\)\s*\}/)
})

test('전체 앱 초기화는 서버와 알림 삭제 성공 뒤에만 로컬 상태를 지운다', async () => {
  const resetSource = app.match(/const resetApplication = (async \(\) => \{[\s\S]*?\n  \})\n/)?.[1]
  assert.ok(resetSource)

  const events = []
  let finishServerDelete
  const serverDelete = new Promise((resolve) => { finishServerDelete = resolve })
  const createReset = new Function(
    'deleteDeviceData', 'notificationService', 'localStorage', 'STORE_KEY',
    'setShowAttend', 'setSt', 'DEFAULT_STATE',
    `return (${resetSource})`,
  )
  const reset = createReset(
    async () => { events.push('server'); await serverDelete },
    { disable: async () => { events.push('notifications') } },
    { removeItem: (key) => { events.push(`remove:${key}`) } },
    'banguli_app_v1',
    () => { events.push('attendance') },
    () => { events.push('state') },
    { onboarded: false },
  )

  const pending = reset()
  await Promise.resolve()
  assert.deepEqual(events, ['server'])
  finishServerDelete()
  await pending
  assert.deepEqual(events, [
    'server', 'notifications', 'remove:banguli_app_v1', 'remove:device_id', 'attendance', 'state',
  ])
})

test('전체 앱 초기화 실패는 로컬 상태를 보존해 다시 시도할 수 있다', async () => {
  const resetSource = app.match(/const resetApplication = (async \(\) => \{[\s\S]*?\n  \})\n/)?.[1]
  assert.ok(resetSource)
  const createReset = new Function(
    'deleteDeviceData', 'notificationService', 'localStorage', 'STORE_KEY',
    'setShowAttend', 'setSt', 'DEFAULT_STATE',
    `return (${resetSource})`,
  )

  for (const failure of ['server', 'notifications']) {
    const localEffects = []
    const reset = createReset(
      async () => { if (failure === 'server') throw new Error('server failed') },
      { disable: async () => { if (failure === 'notifications') throw new Error('notification failed') } },
      { removeItem: (key) => { localEffects.push(key) } },
      'banguli_app_v1',
      () => { localEffects.push('attendance') },
      () => { localEffects.push('state') },
      { onboarded: false },
    )

    await assert.rejects(reset())
    assert.deepEqual(localEffects, [], `${failure} 실패 시 로컬 상태가 변경됨`)
  }
})

test('설정의 위험 카드는 이중 확인과 처리 중 중복 클릭 차단 및 실패 안내를 제공한다', () => {
  assert.match(settings, /const \[resetStep, setResetStep\] = useState\(0\)/)
  assert.match(settings, /const \[resetPending, setResetPending\] = useState\(false\)/)
  assert.match(settings, /const resetPendingRef = useRef\(false\)/)
  assert.match(settings, /if \(resetPendingRef\.current\) return[\s\S]*resetPendingRef\.current = true[\s\S]*finally \{[\s\S]*resetPendingRef\.current = false/)
  assert.match(settings, /서버 검침·교체 이력과 지역 설정, 로컬 이름·코인·아이템·알림 설정을 모두 삭제합니다\./)
  assert.match(settings, /모든 데이터 삭제/)
  assert.match(settings, /disabled=\{resetPending\}/)
  assert.match(settings, /초기화하지 못했습니다\. 다시 시도해 주세요\./)
  assert.match(settings, /onResetApplication/)
  assert.match(app, /onResetApplication=\{resetApplication\}/)
})

test('알림 기본 상태와 설정 화면 계약을 제공한다', () => {
  assert.match(app, /notificationEnabled:\s*false/)
  assert.match(app, /notificationTime:\s*['"]20:00['"]/)
  assert.match(app, /lastReadingDate:\s*null/)
  assert.match(settings, /type=["']time["']/)
  assert.match(settings, /검침을 완료한 날에는 알림을 보내지 않아요\./)
  assert.match(settings, /알림 권한이 꺼져 있어요\. 다시 허용해 주세요\./)
  assert.match(settings, /알림 시간을 저장하지 못했습니다\. 다시 시도해 주세요\./)
  assert.match(settings, /type=["']time["'][\s\S]*disabled=\{!st\.notificationEnabled \|\| notificationPending\}/)
})

test('알림 설정은 성공 뒤에만 저장하고 권한 거절과 예약 오류를 구분한다', () => {
  assert.match(app, /const updateNotificationSettings = async \(\{ enabled, time \}\) => \{[\s\S]*notificationService\.enable\(\{ time, lastReadingDate: st\.lastReadingDate \}\)[\s\S]*notificationService\.disable\(\)[\s\S]*if \(enabled && !result\.enabled\) \{[\s\S]*patch\(\{ notificationEnabled: false \}\)[\s\S]*patch\(\{ notificationEnabled: enabled, notificationTime: time \}\)/)
  assert.match(settings, /const result = await onNotificationChange\(\{ enabled, time \}\)/)
  assert.match(settings, /changeNotification\(ev\.target\.checked\)/)
  assert.match(settings, /onClick=\{\(\) => \{ void changeNotification\(true, notificationTime\) \}\}/)
  assert.match(settings, /catch \{[\s\S]*setNotificationError\(['"]schedule-error['"]\)/)
  assert.match(settings, /setNotificationRetry\(\{ enabled, time \}\)/)
  assert.match(settings, /changeNotification\(notificationRetry\.enabled, notificationRetry\.time\)/)
})

test('알림 시각 재시도 성공은 실패 당시 시각으로 로컬 입력 상태를 동기화한다', async () => {
  const changeNotificationSource = settings.match(
    /const changeNotification = (async \(enabled, time = notificationTime\) => \{[\s\S]*?\n  \})\n\n  const changeNotificationTime/,
  )?.[1]
  assert.ok(changeNotificationSource)

  const createChangeNotification = new Function(
    'notificationTime',
    'setNotificationPending',
    'setNotificationError',
    'setNotificationRetry',
    'setNotificationTime',
    'onNotificationChange',
    'st',
    `return (${changeNotificationSource})`,
  )
  const timeChanges = []
  const changeNotification = createChangeNotification(
    '20:00',
    () => {},
    () => {},
    () => {},
    (time) => { timeChanges.push(time) },
    async () => ({ enabled: true }),
    { notificationTime: '20:00' },
  )

  await changeNotification(true, '21:30')

  assert.deepEqual(timeChanges, ['21:30'])
})

test('검침 완료 시 로컬 날짜를 저장하고 켜진 알림을 다시 예약한다', () => {
  assert.match(app, /import\s+\{\s*notificationService\s*,\s*localDateKey\s*\}\s+from\s+['"]\.\/notifications\.js['"]/)
  assert.match(app, /const completeReading = \(\{ firstReading, usage: nextUsage, reward \}\) => \{[\s\S]*const lastReadingDate = localDateKey\(\)[\s\S]*lastReadingDate,[\s\S]*if \(st\.notificationEnabled\) \{[\s\S]*notificationService\.refresh\(\{ time: st\.notificationTime, lastReadingDate \}\)/)
  assert.match(app, /<CameraFlow[\s\S]*onDone=\{completeReading\}/)
})

test('설정 진입 시 알림을 새로고치고 알림 제어 콜백을 전달한다', () => {
  assert.match(settings, /function SettingsScreen\(\{ st, patch, onReplayOnboarding, onNotificationChange, onNotificationRefresh, onResetApplication \}\)/)
  assert.match(settings, /useEffect\(\(\) => \{[\s\S]*if \(st\.notificationEnabled\)[\s\S]*onNotificationRefresh\(\)[\s\S]*\}, \[\]\)/)
  assert.match(app, /<SettingsScreen[\s\S]*onNotificationChange=\{updateNotificationSettings\}[\s\S]*onNotificationRefresh=\{refreshNotificationSettings\}/)
})

test('글자 크기 크게는 1.15 배율을 저장한다', () => {
  assert.match(settings, /v === ['"]크게['"] \? 1\.15 : 1/)
})

test('Material Symbols와 한글 글꼴을 로드하고 아이콘 리가를 그대로 표시한다', () => {
  assert.match(index, /<link\s+rel=["']preconnect["']\s+href=["']https:\/\/fonts\.googleapis\.com["']\s*\/?>/)
  assert.match(index, /<link\s+rel=["']preconnect["']\s+href=["']https:\/\/fonts\.gstatic\.com["']\s+crossorigin\s*\/?>/)
  assert.match(index, /<link\s+href=["']https:\/\/fonts\.googleapis\.com\/css2\?[^"']*family=Jua[^"']*family=Material\+Symbols\+Rounded[^"']*family=Noto\+Sans\+KR[^"']*display=swap["']\s+rel=["']stylesheet["']\s*\/?>/)

  const iconRule = styles.match(/\.msym\s*\{([^}]*)\}/)?.[1] ?? ''
  assert.match(iconRule, /font-family:\s*['"]Material Symbols Rounded['"]\s*;/)
  assert.match(iconRule, /font-weight:\s*normal\s*;/)
  assert.match(iconRule, /font-style:\s*normal\s*;/)
  assert.match(iconRule, /line-height:\s*1\s*;/)
  assert.match(iconRule, /letter-spacing:\s*normal\s*;/)
  assert.match(iconRule, /text-transform:\s*none\s*;/)
  assert.match(iconRule, /white-space:\s*nowrap\s*;/)
  assert.match(iconRule, /word-wrap:\s*normal\s*;/)
  assert.match(iconRule, /direction:\s*ltr\s*;/)
  assert.match(iconRule, /font-feature-settings:\s*['"]liga['"]\s*;/)
  assert.match(iconRule, /-webkit-font-smoothing:\s*antialiased\s*;/)
  assert.doesNotMatch(iconRule, /border-radius\s*:/)
  assert.doesNotMatch(iconRule, /background\s*:/)
  assert.doesNotMatch(iconRule, /font-size:\s*0(?:\s*!important)?\s*;/)
})

test('공유 지역 매핑은 17개 한글 라벨을 API 코드로 변환한다', async () => {
  const { REGION_LABELS, getRegionCode } = await import('../src/regions.js')
  assert.deepEqual(REGION_LABELS, expectedRegions)
  for (const [code, label] of Object.entries(expectedRegions)) {
    assert.equal(getRegionCode(label), code)
  }
})

test('공유 지역 매핑은 알 수 없는 라벨을 API 코드로 만들지 않는다', async () => {
  const { getRegionCode } = await import('../src/regions.js')
  assert.equal(getRegionCode('없는 지역'), undefined)
})

test('최초 지역 선택은 API 코드로 저장에 성공한 뒤에만 모달을 닫는다', () => {
  assert.match(app, /import\s+\{\s*saveSettings\s*\}\s+from\s+['"]\.\/api\.js['"]/)
  assert.match(app, /import\s+\{\s*getRegionCode\s*\}\s+from\s+['"]\.\/regions\.js['"]/)
  assert.match(app, /const code = getRegionCode\(region\)/)
  assert.match(app, /if \(!code\) \{[\s\S]*setInitialRegionError\(true\)[\s\S]*return/)
  assert.match(app, /await saveSettings\(code\)/)
  assert.match(app, /await saveSettings\(code\)[\s\S]*patch\(\{ region, regionSet: true \}\)/)
})

test('최초 지역 저장 실패는 모달과 오류를 유지하고 같은 선택을 재시도한다', () => {
  assert.match(app, /const \[initialRegionError, setInitialRegionError\] = useState\(false\)/)
  assert.match(app, /catch \{[\s\S]*setInitialRegionError\(true\)/)
  assert.match(app, /<RegionModal[\s\S]*error=\{initialRegionError\}[\s\S]*onSelect=\{selectInitialRegion\}/)
  assert.match(settings, /function RegionModal\(\{ regions, onSelect, saving, error \}\)/)
  assert.match(settings, /error\s*&&[\s\S]*지역 설정을 저장하지 못했습니다\.[\s\S]*다시 시도/)
  assert.match(settings, /<button[^>]*disabled=\{saving\}[^>]*onClick=\{\(\) => setSel\(r\)\}/)
  assert.match(settings, /disabled=\{!sel \|\| saving\}/)
})

test('리포트는 목 이력 대신 전체 및 날짜 지정 이력 API를 사용한다', () => {
  assert.doesNotMatch(report, /BG\.HISTORY/)
  assert.match(report, /import\s+\{\s*getHistory\s*,\s*getHistoryPeriod\s*\}\s+from\s+['"]\.\.\/api\.js['"]/)
  assert.match(report, /getHistory\(\)/)
  assert.match(report, /Promise\.all\(\[\s*getHistoryPeriod\(from, to\),\s*getHistoryPeriod\(previous\.from, previous\.to\),?\s*\]\)/)
  assert.doesNotMatch(report, /하루 평균/)
  assert.match(report, /이전 기간 사용량/)
  assert.match(report, /이번 기간 사용량/)
})

test('리포트는 로딩, 오류 재시도, 빈 이력 상태를 제공한다', () => {
  assert.match(report, /리포트를 불러오는 중이에요/)
  assert.match(report, /리포트를 불러오지 못했습니다/)
  assert.match(report, /다시 시도/)
  assert.match(report, /표시할 검침 이력이 없습니다/)
})

test('리포트는 기본 기간과 날짜 지정의 이번·이전 범위를 표시용으로 제공한다', async () => {
  const { getReportDateRanges, formatReportDateRange } = await import('../src/reportData.js')

  const weekly = getReportDateRanges('주간', '', '', new Date('2026-07-16T12:00:00'))
  assert.deepEqual(weekly, {
    current: { from: '2026-07-10', to: '2026-07-16' },
    previous: { from: '2026-07-03', to: '2026-07-09' },
  })
  assert.equal(formatReportDateRange(weekly.current), '2026.07.10 ~ 2026.07.16')

  assert.deepEqual(
    getReportDateRanges('날짜지정', '2026-07-08', '2026-07-14'),
    {
      current: { from: '2026-07-08', to: '2026-07-14' },
      previous: { from: '2026-07-01', to: '2026-07-07' },
    },
  )
})

test('리포트는 로딩과 빈 상태를 포함해 이번·이전 기간 날짜를 표시한다', () => {
  assert.match(report, /getReportDateRanges/)
  assert.match(report, /formatReportDateRange/)
  assert.match(report, /이번 기간/)
  assert.match(report, /이전 기간 사용량/)
  assert.match(report, /이전 기간/)
})

test('날짜 지정 입력을 지워도 마지막 유효 범위를 유지한다', () => {
  assert.match(report, /value=\{from\}[\s\S]*?onChange=\{\(ev\) => \{ if \(ev\.target\.value\) setFrom\(ev\.target\.value\); \}\}/)
  assert.match(report, /value=\{to\}[\s\S]*?onChange=\{\(ev\) => \{ if \(ev\.target\.value\) setTo\(ev\.target\.value\); \}\}/)
})

test('주간 기간은 오늘을 포함한 정확히 7일과 바로 이전 7일이다', async () => {
  const { getPeriodDateRange } = await import('../src/reportData.js')

  assert.deepEqual(getPeriodDateRange('주간', new Date('2026-07-14T12:00:00')), {
    from: '2026-07-08',
    to: '2026-07-14',
    previousFrom: '2026-07-01',
    previousTo: '2026-07-07',
  })
})

test('월간과 연간 기간은 양끝 포함 각각 정확히 30일과 365일이다', async () => {
  const { getPeriodDateRange } = await import('../src/reportData.js')

  assert.equal(getPeriodDateRange('월간', new Date('2026-07-14T12:00:00')).from, '2026-06-15')
  assert.equal(getPeriodDateRange('연간', new Date('2026-07-14T12:00:00')).from, '2025-07-15')
})

test('기본 리포트는 기간에 완전히 포함된 구간만 API 순서와 무관하게 합산한다', async () => {
  const { summarizeHistory } = await import('../src/reportData.js')
  const history = [
    { start_label: '2026-07-10', end_label: '2026-07-13', usage_m3: 2 },
    { start_label: '2026-06-30', end_label: '2026-07-01', usage_m3: 9 },
    { start_label: '2026-07-08', end_label: '2026-07-14', usage_m3: 1 },
    { start_label: '2026-07-07', end_label: '2026-07-08', usage_m3: 8 },
    { start_label: '2026-07-01', end_label: '2026-07-07', usage_m3: 4 },
  ]

  const summary = summarizeHistory(history, '주간', new Date('2026-07-14T12:00:00'))

  assert.equal(summary.currentTotalLiters, 3000)
  assert.equal(summary.previousTotalLiters, 4000)
})

test('날짜 지정의 직전 기간은 선택 기간과 양끝 포함 일수가 같다', async () => {
  const { getPreviousDateRange } = await import('../src/reportData.js')

  assert.deepEqual(getPreviousDateRange('2026-07-08', '2026-07-14'), {
    from: '2026-07-01',
    to: '2026-07-07',
  })
  assert.deepEqual(getPreviousDateRange('2026-07-14', '2026-07-14'), {
    from: '2026-07-13',
    to: '2026-07-13',
  })
})

test('날짜 지정 이력은 현재와 직전 기간 총량을 리터로 합산한다', async () => {
  const { summarizeCustomHistory } = await import('../src/reportData.js')
  const current = [
    { end_label: '2026-07-10', usage_m3: 0.25 },
    { end_label: '2026-07-02', usage_m3: 1.5 },
  ]
  const previous = [{ end_label: '2026-06-30', usage_m3: 2 }]

  const summary = summarizeCustomHistory(current, previous)

  assert.equal(summary.currentTotalLiters, 1750)
  assert.equal(summary.previousTotalLiters, 2000)
})

test('파일 선택 취소는 서버 연결 오류로 표시하지 않고 촬영 화면으로 돌아간다', () => {
  const capture = cameraFlow.match(/const capture = async \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? ''
  const cancelBranch = capture.match(/if \(caught instanceof Error && caught\.message === ['"]cancelled['"]\) \{([\s\S]*?)\}/)?.[1] ?? ''
  const photoCatch = capture.match(/await getPhoto\(\);[\s\S]*?\} catch \(caught\) \{([\s\S]*?)\n    \}\n\n    try \{/)?.[1] ?? ''
  const cancelConditionIndex = photoCatch.indexOf("if (caught instanceof Error && caught.message === 'cancelled')")
  const serverErrorIndex = photoCatch.indexOf("setError('서버에 연결할 수 없습니다. 다시 시도해주세요.')")

  assert.match(capture, /try \{[\s\S]*await getPhoto\(\)[\s\S]*\} catch \(caught\) \{[\s\S]*setStep\(['"]view['"]\)[\s\S]*return;[\s\S]*\}[\s\S]*try \{[\s\S]*await scanMeter\(file\)/)
  assert.doesNotMatch(cancelBranch, /setError|scanMeter/)
  assert.match(cancelBranch, /return;/)
  assert.ok(cancelConditionIndex >= 0)
  assert.doesNotMatch(photoCatch.slice(0, cancelConditionIndex), /setError/)
  assert.match(photoCatch.slice(0, cancelConditionIndex), /setStep\(['"]view['"]\)/)
  assert.ok(serverErrorIndex > cancelConditionIndex)
})

test('스캔 요청 오류는 cancelled 메시지와 무관하게 서버 연결 오류로 안내한다', () => {
  const capture = cameraFlow.match(/const capture = async \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? ''

  assert.match(capture, /try \{[\s\S]*await scanMeter\(file\)[\s\S]*\} catch \{[\s\S]*서버에 연결할 수 없습니다\.[\s\S]*setStep\(['"]view['"]\)/)
})

test('동일하거나 감소한 검침값의 422 안내를 백엔드 검증 조건과 맞춘다', () => {
  assert.match(cameraFlow, /caught instanceof ApiError && caught\.status === 422[\s\S]*검침값이 이전 기록보다 작거나 같습니다\. 값을 확인해주세요\./)
})

test('계량기 교체는 422 확인 뒤에만 명시적으로 새 기준값으로 저장한다', () => {
  assert.match(api, /saveReading\(\{\s*reading_m3,\s*confidence = null,\s*input_mode,\s*reset_baseline = false\s*\}\)/)
  assert.match(api, /JSON\.stringify\(\{\s*reading_m3,\s*confidence,\s*input_mode,\s*reset_baseline\s*\}\)/)
  assert.match(cameraFlow, /계량기를 교체했어요/)
  assert.match(cameraFlow, /기존 기록은 그대로 보관/)
  assert.match(cameraFlow, /reset_baseline:\s*true/)
  assert.match(cameraFlow, /baseline_reset/)
  assert.match(cameraFlow, /새 계량기 기준값을 저장했어요/)
})

test('계량기 교체 확인은 422가 발생한 저장 요청값을 끝까지 유지한다', () => {
  assert.match(cameraFlow, /setBaselinePrompt\(\{[\s\S]*reading_m3:\s*readingM3,[\s\S]*confidence:\s*inputMode === 'auto' \? confidence : null,[\s\S]*input_mode:\s*inputMode/)
  assert.match(cameraFlow, /reading_m3:\s*baselinePrompt\.reading_m3,[\s\S]*confidence:\s*baselinePrompt\.confidence,[\s\S]*input_mode:\s*baselinePrompt\.input_mode/)
  assert.match(cameraFlow, /saveResult\.reading_m3\.toFixed\(3\)/)
  assert.match(cameraFlow, /const changeDigit[\s\S]*if \(saving\) return;/)
  assert.match(cameraFlow, /const returnToView[\s\S]*if \(saving\) return;/)
  assert.match(cameraFlow, /<GhostBtn onClick=\{\(\) => \{ if \(saving\) return;/)
})

test('계량기 교체 이력 API는 전용 경로를 호출한다', () => {
  assert.match(api, /export async function getReplacementHistory\(\) \{\s*return request\(['"]\/history\/replacements['"]\)\s*\}/)
})

test('계량기 교체 이력 화면은 API와 네 가지 화면 상태를 제공한다', () => {
  assert.match(replacementHistory, /import\s+\{\s*getReplacementHistory\s*\}\s+from\s+['"]\.\.\/api\.js['"]/)
  assert.match(replacementHistory, /useEffect\(\(\) => \{ loadHistory\(\) \}, \[\]\)/)
  assert.match(replacementHistory, /계량기 교체 이력을 불러오는 중입니다\./)
  assert.match(replacementHistory, /계량기 교체 이력이 없습니다\./)
  assert.match(replacementHistory, /계량기 교체 이력을 불러오지 못했습니다\./)
  assert.match(replacementHistory, /다시 시도/)
  assert.match(replacementHistory, /교체일/)
  assert.match(replacementHistory, /이전 마지막 검침/)
  assert.match(replacementHistory, /새 계량기 기준값/)
  assert.match(replacementHistory, /previous_reading_m3 === null[\s\S]*이전 기록 없음/)
  assert.match(replacementHistory, /input_mode === ['"]auto['"][\s\S]*사진 인식[\s\S]*직접 입력/)
})

test('설정의 계량기 교체 이력 카드는 별도 화면을 열고 뒤로 닫는다', () => {
  assert.match(settings, /import ReplacementHistoryScreen from ['"]\.\/ReplacementHistoryScreen\.jsx['"]/)
  assert.match(settings, /const \[showReplacementHistory, setShowReplacementHistory\] = useState\(false\)/)
  assert.match(settings, /if \(showReplacementHistory\) return <ReplacementHistoryScreen onBack=\{\(\) => setShowReplacementHistory\(false\)\}><\/ReplacementHistoryScreen>/)
  assert.match(settings, /계량기 교체 이력[\s\S]*onClick=\{\(\) => setShowReplacementHistory\(true\)\}/)
})
