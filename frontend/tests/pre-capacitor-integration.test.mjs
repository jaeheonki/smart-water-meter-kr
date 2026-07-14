// Capacitor 전환 전 핵심 프론트 연동 계약을 검증하는 테스트
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/components/SettingsScreen.jsx', import.meta.url), 'utf8')
const expectedRegions = {
  seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천', gwangju: '광주',
  daejeon: '대전', ulsan: '울산', sejong: '세종', gyeonggi: '경기', gangwon: '강원',
  chungbuk: '충북', chungnam: '충남', jeonju: '전주', yeosu: '여수', pohang: '포항',
  changwon: '창원', jeju: '제주',
}

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
