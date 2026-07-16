// 계량기 교체 이력의 로딩과 결과 상태를 보여주는 설정 하위 화면
import { useEffect, useState } from 'react'
import { getReplacementHistory } from '../api.js'
import { BGC, Card, GhostBtn, PrimaryBtn, ScreenHead, SectionLabel } from './ui.jsx'

function ReplacementHistoryScreen({ onBack }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadHistory = async () => {
    setLoading(true)
    setError(false)
    try {
      setHistory(await getReplacementHistory())
    } catch {
      setHistory([])
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadHistory() }, [])

  return (
    <div data-screen-label="계량기 교체 이력" className="fade-up" style={{ padding: '0 18px 100px' }}>
      <ScreenHead title="계량기 교체 이력" sub="새 계량기로 바꾼 기록을 확인하세요"></ScreenHead>
      <GhostBtn icon="arrow_back" onClick={onBack} style={{ margin: '10px 0 12px' }}>설정으로 돌아가기</GhostBtn>

      {loading ? (
        <Card><div style={{ textAlign: 'center', color: BGC.sub }}>계량기 교체 이력을 불러오는 중입니다.</div></Card>
      ) : error ? (
        <Card>
          <div style={{ textAlign: 'center', color: BGC.sub }}>계량기 교체 이력을 불러오지 못했습니다.</div>
          <PrimaryBtn icon="refresh" onClick={loadHistory} style={{ marginTop: 12 }}>다시 시도</PrimaryBtn>
        </Card>
      ) : history.length === 0 ? (
        <Card><div style={{ textAlign: 'center', color: BGC.sub }}>계량기 교체 이력이 없습니다.</div></Card>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {history.map((item, index) => (
            <Card key={`${item.replaced_at}-${index}`}>
              <SectionLabel icon="swap_horiz">교체일 {item.replaced_at.slice(0, 10)}</SectionLabel>
              <div style={{ display: 'grid', gap: 8, fontSize: 14, color: BGC.ink }}>
                <div>이전 마지막 검침 <b>{item.previous_reading_m3 === null ? '이전 기록 없음' : `${item.previous_reading_m3.toLocaleString()}㎥`}</b></div>
                <div>새 계량기 기준값 <b>{item.baseline_reading_m3.toLocaleString()}㎥</b></div>
                <div>입력 방식 <b>{item.input_mode === 'auto' ? '사진 인식' : '직접 입력'}</b></div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default ReplacementHistoryScreen
