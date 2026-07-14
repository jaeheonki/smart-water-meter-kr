// 주간과 월간 물 사용 이력을 보여주는 가계부 화면
import React, { useState } from 'react'
import BG from '../mockData.js'
import { BGC, MIcon, Card, PrimaryBtn, SectionLabel, Segmented, ScreenHead, Chip } from './ui.jsx'

function monthEntries(usage, recorded) {
  const now = new Date();
  const list = BG.HISTORY.filter((h) => h.date.getMonth() === now.getMonth() && h.date.getFullYear() === now.getFullYear());
  if (recorded) list.push({ date: now, liters: usage, recorded: true, isToday: true });
  return list;
}

function LedgerScreen({ usage, recorded, goal, onNav, unit, tariff }) {
  const [mode, setMode] = useState('주간');
  const fmtV = (liters) => (unit === '원' ? '₩' + Math.round(liters * (tariff || 1)).toLocaleString() : liters.toLocaleString() + 'L');
  const now = new Date();
  const week = BG.HISTORY.slice(-6).concat([{ date: now, liters: recorded ? usage : 0, recorded, isToday: true }]);
  const maxL = Math.max(goal, ...week.map((w) => w.liters)) * 1.12;
  const month = monthEntries(usage, recorded);
  const mRec = month.filter((m) => m.recorded);
  const mTotal = mRec.reduce((s, m) => s + m.liters, 0);
  const mHit = mRec.filter((m) => m.liters <= goal).length;

  const rowChip = (h) => {
    if (!h.recorded) return <Chip color="#93A9BA" bg="#EFF4F8">미기록</Chip>;
    const d = goal - h.liters;
    return d >= 0
      ? <Chip icon="check_circle" color="#2C8A60" bg="#E8F6EF">-{d}L 절약</Chip>
      : <Chip icon="error" color="#C26A1B" bg="#FDEFD9">+{-d}L 초과</Chip>;
  };

  return (
    <div data-screen-label="물 가계부" className="fade-up" style={{ padding: '0 18px 100px' }}>
      <ScreenHead title="물 가계부" sub="계량기 실측으로 기록된 우리집 물 사용"></ScreenHead>
      <div style={{ margin: '10px 0 14px' }}>
        <Segmented options={['주간', '월간']} value={mode} onChange={setMode}></Segmented>
      </div>

      {mode === '주간' ? (
        <React.Fragment>
          <Card>
            <SectionLabel icon="bar_chart" right={<Chip color={BGC.skyDeep}>목표 {goal}L</Chip>}>최근 7일</SectionLabel>
            <div style={{ position: 'relative', height: 168, marginTop: 6 }}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 26 + (goal / maxL) * 130, borderTop: '2px dashed #AFD4EE' }}></div>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                {week.map((w, i) => {
                  const h = w.recorded ? Math.max(10, (w.liters / maxL) * 130) : 8;
                  const today = !!w.isToday;
                  const over = w.liters > goal;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span className="jua" style={{ fontSize: 11, color: w.recorded ? (over ? '#C26A1B' : BGC.skyDeep) : '#A9C0D2' }}>
                        {w.recorded ? w.liters : '–'}
                      </span>
                      <div style={{
                        width: '74%', height: h, borderRadius: '8px 8px 4px 4px',
                        background: !w.recorded ? '#E4EEF6'
                          : today ? 'linear-gradient(180deg,#6FD6AE,#2C8A60)'
                          : over ? 'linear-gradient(180deg,#FFC46B,#F5894F)'
                          : 'linear-gradient(180deg,#7BCBFF,#2E86C9)',
                        border: today ? '1.5px solid #1F7A52' : 'none',
                      }}></div>
                      <span style={{ fontSize: 10.5, fontWeight: today ? 800 : 600, color: today ? BGC.ink : BGC.sub }}>
                        {today ? '오늘' : BG.dayName(w.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card style={{ marginTop: 12 }} pad={10}>
            {[...week].reverse().map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 8px', borderBottom: i < week.length - 1 ? `1px solid #EDF5FB` : 'none' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: h.recorded ? '#EAF5FD' : '#F1F5F8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MIcon name={h.recorded ? 'water_drop' : 'close'} size={19} color={h.recorded ? BGC.skyDeep : '#A9C0D2'}></MIcon>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: BGC.ink }}>
                    {h.isToday ? '오늘' : `${BG.fmtDate(h.date)} (${BG.dayName(h.date)})`}
                  </div>
                  <div style={{ fontSize: 11.5, color: BGC.sub, marginTop: 1 }}>
                    {h.recorded ? `에너지 ${BG.fmt1(BG.energyOf(h.liters).total)}kWh · CO₂ ${BG.fmt1(BG.energyOf(h.liters).co2)}kg` : h.isToday ? '계량기를 찍어주세요' : '기록이 없어요'}
                  </div>
                </div>
                {h.recorded && <span className="jua" style={{ fontSize: 17, color: BGC.ink }}>{fmtV(h.liters)}</span>}
                {h.isToday && !h.recorded
                  ? <PrimaryBtn icon="photo_camera" onClick={() => onNav('camera')} style={{ width: 'auto', minHeight: 36, padding: '0 12px', fontSize: 13 }}>기록</PrimaryBtn>
                  : rowChip(h)}
              </div>
            ))}
          </Card>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <Card>
            <SectionLabel icon="calendar_month">{now.getMonth() + 1}월 사용 요약</SectionLabel>
            <div style={{ display: 'flex', textAlign: 'center' }}>
              {[['누적 사용', unit === '원' ? fmtV(mTotal) : (mTotal / 1000).toFixed(2) + '㎥'], ['목표 달성', mHit + '일'], ['하루 평균', fmtV(Math.round(mTotal / Math.max(1, mRec.length)))]].map(([k, v]) => (
                <div key={k} style={{ flex: 1 }}>
                  <div className="jua" style={{ fontSize: 22, color: BGC.skyDeep }}>{v}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: BGC.sub, marginTop: 2 }}>{k}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <SectionLabel icon="grid_view">날짜별 현황</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {month.map((m, i) => {
                const ok = m.recorded && m.liters <= goal;
                const over = m.recorded && m.liters > goal;
                return (
                  <div key={i} style={{
                    aspectRatio: '1', borderRadius: 10,
                    background: ok ? '#CDE9FD' : over ? '#FDE3C8' : '#EFF4F8',
                    border: m.isToday ? `2px solid ${BGC.skyDeep}` : 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: ok ? BGC.skyDeep : over ? '#C26A1B' : '#A9C0D2' }}>{m.date.getDate()}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
              <Chip color={BGC.skyDeep}>달성</Chip>
              <Chip color="#C26A1B" bg="#FDEFD9">초과</Chip>
              <Chip color="#93A9BA" bg="#EFF4F8">미기록</Chip>
            </div>
          </Card>
        </React.Fragment>
      )}
    </div>
  );
}

export default LedgerScreen
