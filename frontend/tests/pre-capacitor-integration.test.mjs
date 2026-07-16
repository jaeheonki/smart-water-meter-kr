// Capacitor 전환 전 핵심 프론트 연동 계약을 검증하는 테스트
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/components/SettingsScreen.jsx', import.meta.url), 'utf8')
const report = readFileSync(new URL('../src/components/ReportScreen.jsx', import.meta.url), 'utf8')
const cameraFlow = readFileSync(new URL('../src/components/CameraFlow.jsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../src/api.js', import.meta.url), 'utf8')
const expectedRegions = {
  seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천', gwangju: '광주',
  daejeon: '대전', ulsan: '울산', sejong: '세종', gyeonggi: '경기', gangwon: '강원',
  chungbuk: '충북', chungnam: '충남', jeonju: '전주', yeosu: '여수', pohang: '포항',
  changwon: '창원', jeju: '제주',
}

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
