// 기간별 물 사용을 에너지와 탄소로 환산하는 리포트 화면
import { useEffect, useState } from 'react'
import BG from '../mockData.js'
import { getHistory, getHistoryPeriod } from '../api.js'
import { formatReportDateRange, getPreviousDateRange, getReportDateRanges, summarizeCustomHistory, summarizeHistory } from '../reportData.js'
import { BGC, MIcon, Card, SectionLabel, Segmented, ScreenHead, Chip } from './ui.jsx'

function ReportScreen({ usage, recorded, goal }) {
  const now = new Date();
  const [period, setPeriod] = useState('월간');
  const fmtD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const _defFrom = new Date(now); _defFrom.setDate(_defFrom.getDate() - 30);
  const [from, setFrom] = useState(fmtD(_defFrom));
  const [to, setTo] = useState(fmtD(now));
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const isCustom = period === '날짜지정';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    const load = async () => {
      try {
        if (isCustom) {
          const previous = getPreviousDateRange(from, to);
          const [history, previousHistory] = await Promise.all([
            getHistoryPeriod(from, to),
            getHistoryPeriod(previous.from, previous.to),
          ]);
          if (active) setSummary(summarizeCustomHistory(history, previousHistory));
        } else {
          const history = await getHistory();
          if (active) setSummary(summarizeHistory(history, period));
        }
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [period, from, to, isCustom, reloadKey]);

  const ranges = getReportDateRanges(period, from, to, now);
  const currentRangeLabel = formatReportDateRange(ranges.current);
  const previousRangeLabel = formatReportDateRange(ranges.previous);
  const periodLabel = isCustom ? currentRangeLabel : period;
  const mTotal = summary?.currentTotalLiters || 0;
  const e = BG.energyOf(mTotal);
  const currentTotal = summary?.currentTotalLiters || 0;
  const previousTotal = summary?.previousTotalLiters || 0;
  const diffPct = previousTotal ? Math.round(((previousTotal - currentTotal) / previousTotal) * 1000) / 10 : 0;
  const pines = Math.max(1, Math.round(e.co2 / 8.8)); // 소나무 1그루 연간 흡수 ≈ 8.8kg

  const row = (ic, c, label, sub, v) => (
    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0' }}>
      <div style={{ width: 40, height: 40, borderRadius: 13, background: '#F4FAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <MIcon name={ic} size={21} color={c}></MIcon>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: BGC.ink }}>{label}</div>
        <div style={{ fontSize: 11.5, color: BGC.sub }}>{sub}</div>
      </div>
      <span className="jua" style={{ fontSize: 17, color: BGC.ink }}>{BG.fmt1(v)} kWh</span>
    </div>
  );

  const controls = (
    <>
      <div style={{ margin: '10px 0 2px' }}>
        <Segmented options={['주간', '월간', '연간', '날짜지정']} value={period} onChange={setPeriod}></Segmented>
      </div>
      {isCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 2px 0' }}>
          <input type="date" value={from} max={to} onChange={(ev) => { if (ev.target.value) setFrom(ev.target.value); }} style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '9px 10px', borderRadius: 12, border: `1.5px solid ${BGC.line}`, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: BGC.ink, background: '#fff' }}></input>
          <span style={{ color: BGC.sub, fontWeight: 800 }}>~</span>
          <input type="date" value={to} min={from} onChange={(ev) => { if (ev.target.value) setTo(ev.target.value); }} style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '9px 10px', borderRadius: 12, border: `1.5px solid ${BGC.line}`, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: BGC.ink, background: '#fff' }}></input>
        </div>
      )}
      <div style={{ margin: '8px 2px 0', textAlign: 'center', color: BGC.sub, fontSize: 12.5, fontWeight: 700 }}>
        이번 기간 {currentRangeLabel}
      </div>
    </>
  );

  if (loading || error || !summary?.currentCount) {
    return (
      <div data-screen-label="에너지 리포트" className="fade-up" style={{ padding: '0 18px 100px' }}>
        <ScreenHead title="에너지 리포트" sub="기간을 선택해 물 사용을 에너지·탄소로 환산해 봐요"></ScreenHead>
        {controls}
        <Card style={{ marginTop: 12, textAlign: 'center', color: BGC.sub }}>
          {loading ? '리포트를 불러오는 중이에요' : error ? (
            <>
              <div>리포트를 불러오지 못했습니다.</div>
              <button type="button" onClick={() => setReloadKey((key) => key + 1)} style={{ marginTop: 10 }}>다시 시도</button>
            </>
          ) : '표시할 검침 이력이 없습니다.'}
        </Card>
      </div>
    );
  }

  return (
    <div data-screen-label="에너지 리포트" className="fade-up" style={{ padding: '0 18px 100px' }}>
      <ScreenHead title="에너지 리포트" sub="기간을 선택해 물 사용을 에너지·탄소로 환산해 봐요"></ScreenHead>

      {controls}

      <div style={{
        marginTop: 10, borderRadius: 24, padding: '20px 20px 18px', color: '#fff',
        background: 'linear-gradient(135deg, #4FB1F0, #2E86C9)', boxShadow: '0 8px 22px rgba(46,134,201,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          <MIcon name="water_drop" size={17} color="#fff"></MIcon>
          <span style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>{periodLabel} 물 사용 {(mTotal / 1000).toFixed(2)}㎥ ({mTotal.toLocaleString()}L)</span>
        </div>
        <div style={{ display: 'flex', marginTop: 14, textAlign: 'center' }}>
          <div style={{ flex: 1 }}>
            <div className="jua" style={{ fontSize: 32 }}>{BG.fmt1(e.total)}<span style={{ fontSize: 16 }}> kWh</span></div>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, marginTop: 2 }}>환산 에너지</div>
          </div>
          <div style={{ width: 1.5, background: 'rgba(255,255,255,0.35)', margin: '4px 0' }}></div>
          <div style={{ flex: 1 }}>
            <div className="jua" style={{ fontSize: 32 }}>{BG.fmt1(e.co2)}<span style={{ fontSize: 16 }}> kg</span></div>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, marginTop: 2 }}>CO₂ 배출</div>
          </div>
        </div>
      </div>

      <Card style={{ marginTop: 12 }}>
        <SectionLabel icon="account_tree">어디에 쓰인 에너지일까요?</SectionLabel>
        {row('local_fire_department', '#C26A1B', '온수 가열', '물의 45% × 60→15℃ ÷ 효율 0.85', e.hot)}
        {row('water_drop', BGC.skyDeep, '상수도 공급', '취수·정수·가압 0.23 kWh/㎥', e.supply)}
        {row('waves', '#2C8A60', '하수 처리', '0.45 kWh/㎥', e.sewage)}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <SectionLabel icon="cached">이만큼이에요</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[['battery_charging_full', BGC.skyDeep, '#EAF5FD', '스마트폰 충전', `약 ${e.phoneCharges.toLocaleString()}회`], ['park', '#2C8A60', '#E8F6EF', '소나무 CO₂ 흡수', `약 ${pines}그루의 1년치`]].map(([ic, c, b, label, val]) => (
            <div key={ic} style={{ background: b, borderRadius: 16, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MIcon name={ic} size={22} color={c}></MIcon>
              </div>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: BGC.sub }}>{label}</span>
              <span className="jua" style={{ fontSize: 17, color: BGC.ink }}>{val}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <SectionLabel icon="trending_down" right={diffPct > 0 && <Chip icon="check_circle" color="#2C8A60" bg="#E8F6EF">{diffPct}% 절감</Chip>}>방울이 키우기 전후</SectionLabel>
        {[
          ['이전 기간 사용량', previousRangeLabel, previousTotal, '#C9DFF0'],
          ['이번 기간 사용량', currentRangeLabel, currentTotal, 'linear-gradient(90deg,#7BCBFF,#2E86C9)'],
        ].map(([label, rangeLabel, value, background]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
            <div style={{ width: 128 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: BGC.sub }}>{label}</div>
              <div style={{ fontSize: 10.5, color: '#9FB9CC', marginTop: 2 }}>{rangeLabel}</div>
            </div>
            <div style={{ flex: 1, height: 16, borderRadius: 99, background: '#EFF6FC', overflow: 'hidden' }}>
              <div style={{ width: (value / Math.max(1, previousTotal, currentTotal)) * 100 + '%', height: '100%', borderRadius: 99, background }}></div>
            </div>
            <span className="jua" style={{ fontSize: 14, color: BGC.ink, width: 44, textAlign: 'right' }}>{value}L</span>
          </div>
        ))}
        <div style={{ fontSize: 12, color: BGC.sub, marginTop: 8, textAlign: 'center' }}>매일 기록한 효과예요 — 방울이가 자랑스러워해요!</div>
      </Card>

      <div style={{ fontSize: 10.5, color: '#9FB9CC', lineHeight: 1.6, margin: '14px 4px 0' }}>
        환산 계수 출처: 정수 0.23 kWh/㎥(한국수자원공사) · 하수 0.45 kWh/㎥(한국환경공단) ·
        전력배출계수 0.4173 kg CO₂/kWh(GIR 2023) · 온수 비율 45%(KISTI 실측). 공개통계 기반 추정치로, 추세 파악용이에요.
      </div>
    </div>
  );
}

export default ReportScreen
