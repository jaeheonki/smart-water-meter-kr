// 사용자 이름과 표시 단위 및 지역을 관리하는 설정 화면과 앱 모달
import { useEffect, useState } from 'react'
import { getRegions, getSettings, saveSettings } from '../api.js'
import { REGION_LABELS } from '../regions.js'
import { BGC, MIcon, Card, PrimaryBtn, SectionLabel, Segmented, ScreenHead } from './ui.jsx'

function SettingsScreen({ st, patch, onReplayOnboarding, onNotificationChange, onNotificationRefresh }) {
  const [regionCodes, setRegionCodes] = useState([])
  const [currentRegion, setCurrentRegion] = useState(null)
  const [loadingRegions, setLoadingRegions] = useState(true)
  const [regionError, setRegionError] = useState(false)
  const [savingRegion, setSavingRegion] = useState(false)
  const [failedRegion, setFailedRegion] = useState(null)
  const [notificationPending, setNotificationPending] = useState(false)
  const [notificationError, setNotificationError] = useState(null)
  const [notificationRetry, setNotificationRetry] = useState(null)
  const [notificationTime, setNotificationTime] = useState(st.notificationTime || '20:00')
  const set = (k, v) => patch({ [k]: v });
  const inputStyle = { width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '11px 13px', borderRadius: 12, border: `1.5px solid ${BGC.line}`, fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: BGC.ink, background: '#fff' };
  const labelStyle = { fontSize: 12.5, fontWeight: 800, color: BGC.sub };
  const fsLabel = (st.fontScale || 1) < 1 ? '작게' : (st.fontScale || 1) > 1 ? '크게' : '보통';

  const loadRegions = async () => {
    setLoadingRegions(true)
    setRegionError(false)
    setFailedRegion(null)
    try {
      const [codes, settings] = await Promise.all([getRegions(), getSettings()])
      const region = settings.region || 'seoul'
      setRegionCodes(codes)
      setCurrentRegion(region)
      patch({ region: REGION_LABELS[region] || region })
    } catch {
      setRegionCodes([])
      setRegionError(true)
    } finally {
      setLoadingRegions(false)
    }
  }

  useEffect(() => { loadRegions() }, [])
  useEffect(() => {
    if (st.notificationEnabled) {
      setNotificationPending(true)
      void onNotificationRefresh()
        .then((result) => {
          if (!result.enabled) setNotificationError('permission-denied')
        })
        .catch(() => {
          setNotificationRetry({ enabled: true, time: notificationTime })
          setNotificationError('schedule-error')
        })
        .finally(() => { setNotificationPending(false) })
    }
  }, [])

  const changeNotification = async (enabled, time = notificationTime) => {
    setNotificationPending(true)
    setNotificationError(null)
    setNotificationRetry(null)
    try {
      const result = await onNotificationChange({ enabled, time })
      if (enabled && !result.enabled) setNotificationError('permission-denied')
      else setNotificationTime(time)
    } catch {
      setNotificationTime(st.notificationTime || '20:00')
      setNotificationRetry({ enabled, time })
      setNotificationError('schedule-error')
    } finally {
      setNotificationPending(false)
    }
  }

  const changeNotificationTime = (time) => {
    setNotificationTime(time)
    if (st.notificationEnabled) void changeNotification(true, time)
    else patch({ notificationTime: time })
  }

  const selectRegion = async (code) => {
    setSavingRegion(true)
    setRegionError(false)
    setFailedRegion(null)
    try {
      const saved = await saveSettings(code)
      const region = saved.region || code
      setCurrentRegion(region)
      patch({ region: REGION_LABELS[region] || region })
    } catch {
      setFailedRegion(code)
      setRegionError(true)
    } finally {
      setSavingRegion(false)
    }
  }

  return (
    <div data-screen-label="설정" className="fade-up" style={{ padding: '0 18px 100px' }}>
      <ScreenHead title="설정" sub="앱을 내 취향대로 맞춰보세요"></ScreenHead>

      <Card style={{ marginTop: 10 }}>
        <SectionLabel icon="badge">이름</SectionLabel>
        <div style={labelStyle}>사용자 이름</div>
        <input value={st.userName || ''} onChange={(ev) => set('userName', ev.target.value)} placeholder="우리집" style={inputStyle}></input>
        <div style={{ ...labelStyle, marginTop: 12 }}>방울이 이름</div>
        <input value={st.dolphinName || ''} onChange={(ev) => set('dolphinName', ev.target.value)} placeholder="방울이" style={inputStyle}></input>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <SectionLabel icon="text_fields">글자 크기</SectionLabel>
        <Segmented options={['작게', '보통', '크게']} value={fsLabel} onChange={(v) => set('fontScale', v === '작게' ? 0.9 : v === '크게' ? 1.15 : 1)}></Segmented>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <SectionLabel icon="notifications">매일 검침 알림</SectionLabel>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontWeight: 800, color: BGC.ink }}>알림 받기</span>
          <input type="checkbox" checked={Boolean(st.notificationEnabled)} disabled={notificationPending}
            onChange={(ev) => { void changeNotification(ev.target.checked) }}></input>
        </label>
        <input type="time" value={notificationTime} disabled={notificationPending}
          onChange={(ev) => changeNotificationTime(ev.target.value)} style={inputStyle}></input>
        <div style={{ fontSize: 12, color: BGC.sub, marginTop: 8 }}>검침을 완료한 날에는 알림을 보내지 않아요.</div>
        {notificationError === 'permission-denied' && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: '#C26A1B' }}>알림 권한이 꺼져 있어요. 다시 허용해 주세요.</div>
            <PrimaryBtn icon="refresh" disabled={notificationPending}
              onClick={() => { void changeNotification(true, notificationTime) }}>다시 시도</PrimaryBtn>
          </div>
        )}
        {notificationError === 'schedule-error' && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: '#C26A1B' }}>알림 시간을 저장하지 못했습니다. 다시 시도해 주세요.</div>
            <PrimaryBtn icon="refresh" disabled={notificationPending}
              onClick={() => { void changeNotification(notificationRetry.enabled, notificationRetry.time) }}>다시 시도</PrimaryBtn>
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <SectionLabel icon="receipt_long">가계부 표시 단위</SectionLabel>
        <Segmented options={['리터 (L)', '금액 (원)']} value={st.ledgerUnit === '원' ? '금액 (원)' : '리터 (L)'} onChange={(v) => set('ledgerUnit', v === '금액 (원)' ? '원' : 'L')}></Segmented>
        <div style={{ fontSize: 12, color: BGC.sub, marginTop: 8 }}>금액은 선택한 지역 요금 기준 추정치예요.</div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <SectionLabel icon="location_on">지역</SectionLabel>
        {loadingRegions ? (
          <div style={{ color: BGC.sub }}>지역 설정을 불러오는 중입니다.</div>
        ) : regionCodes.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {regionCodes.map((code) => {
              const on = currentRegion === code;
              return (
                <button key={code} className="press" disabled={savingRegion} onClick={() => selectRegion(code)} style={{
                  padding: '9px 16px', borderRadius: 99, cursor: savingRegion ? 'default' : 'pointer', fontFamily: 'Jua', fontSize: 14,
                  border: on ? 'none' : `1.5px solid ${BGC.line}`,
                  background: on ? BGC.sky : '#fff', color: on ? '#fff' : BGC.sub,
                }}>{REGION_LABELS[code] || code}</button>
              );
            })}
          </div>
        ) : null}
        {regionError && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: '#C26A1B' }}>지역 설정을 처리하지 못했습니다.</div>
            <PrimaryBtn icon="refresh" onClick={failedRegion ? () => selectRegion(failedRegion) : loadRegions} style={{ marginTop: 8 }}>다시 시도</PrimaryBtn>
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <SectionLabel icon="replay">처음부터</SectionLabel>
        <button className="press" onClick={onReplayOnboarding} style={{
          width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: 4, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
          border: `1.5px solid ${BGC.line}`, background: '#fff', color: BGC.sky, fontFamily: 'Jua', fontSize: 15,
        }}>
          <MIcon name="replay" size={18} color={BGC.sky}></MIcon>
          처음부터 보기
        </button>
        <div style={{ fontSize: 12, color: BGC.sub, marginTop: 8 }}>온보딩을 다시 보고 앱을 처음 상태로 되돌려요. (보유 코인·아이템은 유지)</div>
      </Card>
    </div>
  );
}

function ModalOverlay({ children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,50,80,0.45)', padding: 20, boxSizing: 'border-box' }}>
      {children}
    </div>
  );
}

function AttendanceModal({ streak, reward, onClaim }) {
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  const todayIdx = (new Date().getDay() + 6) % 7;
  return (
    <ModalOverlay>
      <div className="fade-up" style={{ width: 320, background: '#fff', borderRadius: 24, padding: '22px 20px', textAlign: 'center', boxShadow: '0 20px 50px rgba(21,58,86,0.35)', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 40 }}>💧</div>
        <div className="jua" style={{ fontSize: 21, color: BGC.ink, marginTop: 4 }}>오늘도 출석 완료!</div>
        <div style={{ fontSize: 13, color: BGC.sub, marginTop: 6 }}>연속 <b style={{ color: BGC.skyDeep }}>{streak}일</b>째 방울이를 돌봐주고 있어요</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, margin: '18px 0' }}>
          {days.map((d, i) => {
            const on = i <= todayIdx;
            const today = i === todayIdx;
            return (
              <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: today ? BGC.skyDeep : BGC.sub }}>{d}</div>
                <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: on ? (today ? BGC.sky : '#D6EEFB') : '#EEF4F8', border: today ? `2px solid ${BGC.skyDeep}` : 'none', boxSizing: 'border-box' }}>{on ? '💧' : ''}</div>
              </div>
            );
          })}
        </div>
        <div style={{ background: '#FFF6D8', border: '1.5px solid #F3DF9B', borderRadius: 14, padding: '10px', fontSize: 14, fontWeight: 800, color: '#8A6A14' }}>출석 보상 +{reward} 나무코인</div>
        <PrimaryBtn icon="redeem" onClick={onClaim} style={{ marginTop: 14 }}>코인 받기</PrimaryBtn>
      </div>
    </ModalOverlay>
  );
}

function RegionModal({ regions, onSelect, saving, error }) {
  const [sel, setSel] = useState(null);
  return (
    <ModalOverlay>
      <div className="fade-up" style={{ width: 340, maxHeight: '82%', overflowY: 'auto', background: '#fff', borderRadius: 24, padding: '22px 20px', boxShadow: '0 20px 50px rgba(21,58,86,0.35)', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36 }}>📍</div>
          <div className="jua" style={{ fontSize: 20, color: BGC.ink, marginTop: 4 }}>지역을 선택해 주세요</div>
          <div style={{ fontSize: 12.5, color: BGC.sub, marginTop: 6, lineHeight: 1.5 }}>지역 요금을 기준으로 물 사용을 금액으로 환산해 드려요. 설정에서 언제든 바꿀 수 있어요.</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', margin: '18px 0 6px' }}>
          {regions.map((r) => {
            const on = sel === r;
            return (
              <button key={r} className="press" disabled={saving} onClick={() => setSel(r)} style={{ padding: '9px 15px', borderRadius: 99, cursor: saving ? 'default' : 'pointer', fontFamily: 'Jua', fontSize: 14, border: on ? 'none' : `1.5px solid ${BGC.line}`, background: on ? BGC.sky : '#fff', color: on ? '#fff' : BGC.sub }}>{r}</button>
            );
          })}
        </div>
        {error && <div style={{ marginTop: 10, fontSize: 12, color: '#C26A1B', textAlign: 'center' }}>지역 설정을 저장하지 못했습니다. 다시 시도해 주세요.</div>}
        <PrimaryBtn icon={error ? "refresh" : "check"} disabled={!sel || saving} onClick={() => onSelect(sel)} style={{ marginTop: 10 }}>{saving ? '저장 중...' : error ? '다시 시도' : '이 지역으로 시작하기'}</PrimaryBtn>
      </div>
    </ModalOverlay>
  );
}

export { AttendanceModal, RegionModal }
export default SettingsScreen
