// 이력과 설정 화면의 API 연동 계약을 검증하는 테스트
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ledger = readFileSync(new URL('../src/components/LedgerScreen.jsx', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/components/SettingsScreen.jsx', import.meta.url), 'utf8')

test('이력 화면은 목데이터 대신 이력 API와 화면 내부 상태를 사용한다', () => {
  assert.match(ledger, /import\s+\{\s*getHistory\s*\}\s+from\s+['"]\.\.\/api\.js['"]/)
  assert.match(ledger, /getHistory\(\)/)
  assert.match(ledger, /const week = entries\.slice\(0, 7\)/)
  assert.match(ledger, /\{week\.map\(/)
  assert.doesNotMatch(ledger, /BG\.HISTORY/)
  assert.match(ledger, /검침 기록이 2개 이상 쌓이면 사용량이 표시됩니다/)
  assert.match(ledger, /불러오는 중/)
  assert.match(ledger, /다시 시도/)
  assert.doesNotMatch(ledger, /fetch\s*\(/)
})

test('이력 화면은 같은 날짜 구간에도 고유한 React key를 사용한다', () => {
  assert.match(ledger, /chart\.map\(\(item, index\) =>/)
  assert.match(ledger, /week\.map\(\(item, index\) =>/)
  assert.match(ledger, /month\.map\(\(item, index\) =>/)
  assert.equal(ledger.match(/key=\{`\$\{item\.start_label\}-\$\{item\.end_label\}-\$\{index\}`\}/g)?.length, 3)
})

test('이력 빈 상태는 안내와 카메라 진입 CTA를 함께 제공한다', () => {
  assert.match(ledger, /function LedgerScreen\(\{ goal, onNav, unit \}\)/)
  assert.match(ledger, /검침 기록이 2개 이상 쌓이면 사용량이 표시됩니다[\s\S]*onClick=\{\(\) => onNav\('camera'\)\}[\s\S]*>기록<\/PrimaryBtn>/)
})

test('설정 화면은 지역 API와 명시적 한글 매핑을 사용한다', () => {
  assert.match(settings, /import\s+\{\s*getRegions,\s*getSettings,\s*saveSettings\s*\}\s+from\s+['"]\.\.\/api\.js['"]/)
  assert.match(settings, /Promise\.all\(\[getRegions\(\),\s*getSettings\(\)\]\)/)
  assert.match(settings, /saveSettings\(code\)/)
  assert.match(settings, /const region = saved\.region \|\| code/)
  assert.match(settings, /다시 시도/)
  assert.doesNotMatch(settings, /fetch\s*\(/)

  const mappings = {
    seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천', gwangju: '광주',
    daejeon: '대전', ulsan: '울산', sejong: '세종', gyeonggi: '경기', gangwon: '강원',
    chungbuk: '충북', chungnam: '충남', jeonju: '전주', yeosu: '여수', pohang: '포항',
    changwon: '창원', jeju: '제주',
  }
  for (const [code, label] of Object.entries(mappings)) {
    assert.match(settings, new RegExp(`${code}: ['"]${label}['"]`))
  }
})

test('지역 저장 실패 재시도는 실패한 코드를 다시 저장한다', () => {
  assert.match(settings, /const \[failedRegion, setFailedRegion\] = useState\(null\)/)
  assert.match(settings, /catch \{[\s\S]*setFailedRegion\(code\)[\s\S]*setRegionError\(true\)/)
  assert.match(settings, /onClick=\{failedRegion \? \(\) => selectRegion\(failedRegion\) : loadRegions\}/)
})
