// 복구한 방울이 화면과 localStorage 상태를 조립하는 루트 컴포넌트
import { useEffect, useState } from 'react'
import BG from './mockData.js'
import { BottomNav } from './components/ui.jsx'
import Onboarding from './components/Onboarding.jsx'
import HomeScreen from './components/HomeScreen.jsx'
import CameraFlow from './components/CameraFlow.jsx'
import LedgerScreen from './components/LedgerScreen.jsx'
import ReportScreen from './components/ReportScreen.jsx'
import ShopScreen, { SHOP_ITEMS, wornImgFor, spriteFor, framesFor, facesFor } from './components/ShopScreen.jsx'
import SettingsScreen, { AttendanceModal, RegionModal } from './components/SettingsScreen.jsx'
import { saveSettings } from './api.js'
import { deleteDeviceData } from './api.js'
import { getRegionCode } from './regions.js'
import { notificationService, localDateKeyFromUtcTimestamp } from './notifications.js'
import './App.css'

const STORE_KEY = 'banguli_app_v1'
const DEFAULT_STATE = {
  onboarded: false, screen: 'home', house: '4인 이상',
  recorded: false, usage: 0, coins: 9999,
  owned: ['rain', 'monstera'], equipped: null, placed: ['monstera'],
  userName: '우리집', dolphinName: '방울이', fontScale: 1, ledgerUnit: 'L', region: '서울',
  regionSet: false, lastAttend: null, decorPos: {}, pendingEdit: false,
  notificationEnabled: false, notificationTime: '20:00', lastReadingDate: null,
  room: { theme: null },
}

const REGION_TARIFF = { '서울': 1.0, '부산': 1.3, '대구': 1.2, '인천': 1.0, '광주': 1.1, '대전': 1.0, '울산': 1.2, '세종': 1.0, '경기': 1.1, '강원': 1.2, '충북': 1.1, '충남': 1.1, '전주': 1.1, '여수': 1.1, '포항': 1.2, '창원': 1.2, '제주': 1.3 }

function loadState() {
  try { return { ...DEFAULT_STATE, ...(JSON.parse(localStorage.getItem(STORE_KEY)) || {}) } }
  catch { return { ...DEFAULT_STATE } }
}

function App() {
  const [st, setSt] = useState(loadState)
  const [showAttend, setShowAttend] = useState(false)
  const [savingInitialRegion, setSavingInitialRegion] = useState(false)
  const [initialRegionError, setInitialRegionError] = useState(false)

  useEffect(() => {
    const today = new Date().toDateString()
    if (st.regionSet && st.onboarded && st.lastAttend !== today) setShowAttend(true)
  }, [])
  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify(st)) }, [st])
  useEffect(() => {
    if (st.notificationEnabled) {
      void notificationService.refresh({
        time: st.notificationTime,
        lastReadingDate: st.lastReadingDate,
      }).then((result) => {
        if (!result.enabled) patch({ notificationEnabled: false })
      }).catch(() => {})
    }
  }, [])
  useEffect(() => {
    let listener
    let disposed = false
    void notificationService.listenForActions(() => patch({ screen: 'camera', camStart: 'view' }))
      .then((handle) => {
        if (disposed) void handle.remove().catch(() => {})
        else listener = handle
      })
      .catch(() => {})
    return () => {
      disposed = true
      if (listener) void listener.remove().catch(() => {})
    }
  }, [])
  useEffect(() => {
    const root = document.getElementById('bgScreen')
    if (!root) return
    const fontScale = st.fontScale || 1
    root.querySelectorAll('*').forEach((element) => {
      if (element.classList.contains('msym')) return
      let hasText = false
      element.childNodes.forEach((node) => { if (node.nodeType === 3 && node.textContent.trim()) hasText = true })
      if (!hasText) return
      if (element.dataset.basefs === undefined) element.dataset.basefs = parseFloat(getComputedStyle(element).fontSize)
      element.style.fontSize = (parseFloat(element.dataset.basefs) * fontScale) + 'px'
    })
  })

  const patch = (value) => setSt((state) => ({ ...state, ...value }))
  const nav = (screen) => patch({ screen })
  const updateNotificationSettings = async ({ enabled, time }) => {
    const result = enabled
      ? await notificationService.enable({ time, lastReadingDate: st.lastReadingDate })
      : (await notificationService.disable(), { enabled: false })
    if (enabled && !result.enabled) {
      patch({ notificationEnabled: false })
      return result
    }
    patch({ notificationEnabled: enabled, notificationTime: time })
    return { enabled }
  }
  const refreshNotificationSettings = async () => {
    const result = await notificationService.refresh({
      time: st.notificationTime,
      lastReadingDate: st.lastReadingDate,
    })
    if (!result.enabled) patch({ notificationEnabled: false })
    return result
  }
  const completeReading = ({ firstReading, usage: nextUsage, reward }) => {
    patch({
      recorded: !firstReading,
      usage: nextUsage,
      coins: st.coins + reward,
      screen: 'home',
      camStart: null,
    })
  }
  const recordReading = (recordedAt) => {
    const lastReadingDate = localDateKeyFromUtcTimestamp(recordedAt)
    patch({ lastReadingDate })
    if (st.notificationEnabled) {
      void notificationService.refresh({ time: st.notificationTime, lastReadingDate }).catch(() => {})
    }
  }
  const selectInitialRegion = async (region) => {
    const code = getRegionCode(region)
    if (!code) {
      setInitialRegionError(true)
      return
    }
    setSavingInitialRegion(true)
    setInitialRegionError(false)
    try {
      await saveSettings(code)
      patch({ region, regionSet: true })
    } catch {
      setInitialRegionError(true)
    } finally {
      setSavingInitialRegion(false)
    }
  }
  const resetApplication = async () => {
    await deleteDeviceData()
    await notificationService.disable()
    localStorage.removeItem(STORE_KEY)
    localStorage.removeItem('device_id')
    setShowAttend(false)
    setSt({ ...DEFAULT_STATE })
  }

  const goal = BG.GOAL_BY_HOUSEHOLD[st.house] || 550
  const scenario = '절약'
  const usage = st.recorded ? (st.usage || BG.SCENARIOS[scenario].usage) : BG.SCENARIOS[scenario].usage
  const stage = st.recorded ? 1 : 2
  const streak = BG.STREAK + (st.recorded ? 1 : 0)
  const tip = BG.TIPS[new Date().getDate() % BG.TIPS.length]
  const unit = st.ledgerUnit || 'L'
  const tariff = REGION_TARIFF[st.region] || 1.0
  const allItems = [...SHOP_ITEMS['의상'], ...SHOP_ITEMS['방 꾸미기']]
  const decorOf = (id) => allItems.find((item) => item.id === id)

  let content
  if (!st.onboarded) {
    content = <Onboarding onDone={(house) => patch({ onboarded: true, house, screen: 'home' })} />
  } else if (st.screen === 'camera') {
    content = (
      <CameraFlow scenario={scenario} goal={goal} startStep={st.camStart || 'view'}
        onClose={() => patch({ screen: 'home', camStart: null })}
        onReadingSaved={recordReading}
        onDone={completeReading}
      />
    )
  } else {
    const app = {
      stage, recorded: st.recorded, usage, goal, coins: st.coins, streak, tip,
      house: st.house, userName: st.userName, dolphinName: st.dolphinName, onNav: nav,
      onManual: () => patch({ screen: 'camera', camStart: 'manual' }),
      wornImg: wornImgFor(st.equipped), sprite: spriteFor(st.equipped), frames: framesFor(st.equipped), faces: facesFor(st.equipped),
      owned: st.owned, equipped: st.equipped, onEquip: (id) => patch({ equipped: id }),
      placedItems: st.placed.map((id) => { const item = decorOf(id); return item?.img ? { id, img: item.img, size: item.size || 56 } : null }).filter(Boolean),
      decorPos: st.decorPos || {}, room: st.room || {}, startEdit: st.pendingEdit,
      clearStartEdit: () => setSt((state) => ({ ...state, pendingEdit: false })),
      onMoveDecor: (id, pos) => setSt((state) => ({ ...state, decorPos: { ...(state.decorPos || {}), [id]: pos } })),
    }
    const screens = {
      home: <HomeScreen app={app} />,
      ledger: <LedgerScreen usage={usage} recorded={st.recorded} goal={goal} onNav={nav} unit={unit} tariff={tariff} />,
      report: <ReportScreen usage={usage} recorded={st.recorded} goal={goal} />,
      settings: <SettingsScreen st={st} patch={patch}
        onNotificationChange={updateNotificationSettings} onNotificationRefresh={refreshNotificationSettings}
        onResetApplication={resetApplication} />,
      shop: <ShopScreen coins={st.coins} owned={st.owned} equipped={st.equipped} placed={st.placed}
        onBuy={(id, price) => patch({ coins: st.coins - price, owned: [...st.owned, id] })}
        onEquip={(id) => patch({ equipped: id })}
        onApplyRoom={(theme) => setSt((state) => ({ ...state, room: { theme: state.room?.theme === theme ? null : theme } }))}
        room={st.room || {}}
        onPlace={(id) => { const adding = !st.placed.includes(id); setSt((state) => ({ ...state, placed: adding ? [...state.placed, id] : state.placed.filter((placedId) => placedId !== id), screen: adding ? 'home' : state.screen, pendingEdit: adding ? true : state.pendingEdit })) }}
      />,
    }
    content = (
      <div className="app-shell">
        <div id="bgScreen" className="app-content">{screens[st.screen] || screens.home}</div>
        <BottomNav active={st.screen} onNav={nav} />
      </div>
    )
  }

  return (
    <div className="app-root">
      {content}
      {!st.regionSet && <RegionModal regions={Object.keys(REGION_TARIFF)} saving={savingInitialRegion} error={initialRegionError} onSelect={selectInitialRegion} />}
      {showAttend && st.regionSet && st.onboarded && (
        <AttendanceModal streak={streak} reward={5} onClaim={() => { patch({ coins: st.coins + 5, lastAttend: new Date().toDateString() }); setShowAttend(false) }} />
      )}
    </div>
  )
}

export default App
