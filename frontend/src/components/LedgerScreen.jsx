// 주간과 월간 물 사용 이력을 보여주는 가계부 화면
import React, { useEffect, useState } from 'react'
import { getHistory } from '../api.js'
import { BGC, MIcon, Card, PrimaryBtn, SectionLabel, Segmented, ScreenHead, Chip } from './ui.jsx'

function LedgerScreen({ goal, onNav, unit }) {
  const [mode, setMode] = useState('주간')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadHistory = async () => {
    setLoading(true)
    setError(false)
    try {
      setHistory(await getHistory())
    } catch {
      setHistory([])
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadHistory() }, [])

  const entries = history.map((item) => ({
    ...item,
    date: new Date(`${item.end_label}T00:00:00`),
    liters: Math.round(item.usage_m3 * 1000),
  }))
  const week = entries.slice(0, 7)
  const chart = [...week].reverse()
  const maxL = Math.max(goal, ...week.map((item) => item.liters)) * 1.12
  const now = new Date()
  const month = entries.filter((item) => item.date.getMonth() === now.getMonth() && item.date.getFullYear() === now.getFullYear())
  const mTotal = month.reduce((sum, item) => sum + item.liters, 0)
  const mBill = month.reduce((sum, item) => sum + item.bill_total, 0)
  const mHit = month.filter((item) => item.liters <= goal).length
  const fmtV = (item) => unit === '원' ? `₩${item.bill_total.toLocaleString()}` : `${item.liters.toLocaleString()}L`

  const stateCard = loading ? (
    <Card><div style={{ textAlign: 'center', color: BGC.sub }}>검침 이력을 불러오는 중입니다.</div></Card>
  ) : error ? (
    <Card>
      <div style={{ textAlign: 'center', color: BGC.sub }}>검침 이력을 불러오지 못했습니다.</div>
      <PrimaryBtn icon="refresh" onClick={loadHistory} style={{ marginTop: 12 }}>다시 시도</PrimaryBtn>
    </Card>
  ) : history.length === 0 ? (
    <Card>
      <div style={{ textAlign: 'center', color: BGC.sub }}>검침 기록이 2개 이상 쌓이면 사용량이 표시됩니다</div>
      <PrimaryBtn icon="photo_camera" onClick={() => onNav('camera')} style={{ marginTop: 12 }}>기록</PrimaryBtn>
    </Card>
  ) : null

  return (
    <div data-screen-label="물 가계부" className="fade-up" style={{ padding: '0 18px 100px' }}>
      <ScreenHead title="물 가계부" sub="계량기 실측으로 기록된 우리집 물 사용"></ScreenHead>
      <div style={{ margin: '10px 0 14px' }}>
        <Segmented options={['주간', '월간']} value={mode} onChange={setMode}></Segmented>
      </div>

      {stateCard || (mode === '주간' ? (
        <React.Fragment>
          <Card>
            <SectionLabel icon="bar_chart" right={<Chip color={BGC.skyDeep}>목표 {goal}L</Chip>}>최근 7개 구간</SectionLabel>
            <div style={{ position: 'relative', height: 168, marginTop: 6 }}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 26 + (goal / maxL) * 130, borderTop: '2px dashed #AFD4EE' }}></div>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                {chart.map((item, index) => {
                  const over = item.liters > goal
                  return (
                    <div key={`${item.start_label}-${item.end_label}-${index}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span className="jua" style={{ fontSize: 11, color: over ? '#C26A1B' : BGC.skyDeep }}>{item.liters.toLocaleString()}</span>
                      <div style={{
                        width: '74%', height: Math.max(10, (item.liters / maxL) * 130), borderRadius: '8px 8px 4px 4px',
                        background: over ? 'linear-gradient(180deg,#FFC46B,#F5894F)' : 'linear-gradient(180deg,#7BCBFF,#2E86C9)',
                      }}></div>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: BGC.sub }}>{item.date.getMonth() + 1}/{item.date.getDate()}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>

          <Card style={{ marginTop: 12 }} pad={10}>
            {week.map((item, index) => (
              <div key={`${item.start_label}-${item.end_label}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 8px', borderBottom: index < week.length - 1 ? '1px solid #EDF5FB' : 'none' }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: '#EAF5FD', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MIcon name="water_drop" size={19} color={BGC.skyDeep}></MIcon>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: BGC.ink }}>{item.start_label} ~ {item.end_label}</div>
                  <div style={{ fontSize: 11.5, color: BGC.sub, marginTop: 1 }}>CO₂ {item.co2_kg.toLocaleString()}kg</div>
                </div>
                <span className="jua" style={{ fontSize: 17, color: BGC.ink }}>{fmtV(item)}</span>
                <Chip color={item.liters <= goal ? '#2C8A60' : '#C26A1B'} bg={item.liters <= goal ? '#E8F6EF' : '#FDEFD9'}>{item.liters <= goal ? '달성' : '초과'}</Chip>
              </div>
            ))}
          </Card>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <Card>
            <SectionLabel icon="calendar_month">{now.getMonth() + 1}월 사용 요약</SectionLabel>
            <div style={{ display: 'flex', textAlign: 'center' }}>
              {[["누적 사용", unit === '원' ? `₩${mBill.toLocaleString()}` : `${(mTotal / 1000).toFixed(2)}㎥`], ['목표 달성', `${mHit}회`], ['구간 평균', month.length ? `${Math.round(mTotal / month.length).toLocaleString()}L` : '0L']].map(([key, value]) => (
                <div key={key} style={{ flex: 1 }}>
                  <div className="jua" style={{ fontSize: 22, color: BGC.skyDeep }}>{value}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: BGC.sub, marginTop: 2 }}>{key}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <SectionLabel icon="grid_view">날짜별 현황</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {month.map((item, index) => {
                const ok = item.liters <= goal
                return (
                  <div key={`${item.start_label}-${item.end_label}-${index}`} style={{ aspectRatio: '1', borderRadius: 10, background: ok ? '#CDE9FD' : '#FDE3C8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: ok ? BGC.skyDeep : '#C26A1B' }}>{item.date.getDate()}</span>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
              <Chip color={BGC.skyDeep}>달성</Chip>
              <Chip color="#C26A1B" bg="#FDEFD9">초과</Chip>
            </div>
          </Card>
        </React.Fragment>
      ))}
    </div>
  )
}

export default LedgerScreen
