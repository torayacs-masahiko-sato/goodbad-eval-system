// 画面全体の枠組み：ログイン判定、タブ切替、メンバー一覧の共有、通知（トースト）
import { useCallback, useEffect, useState } from 'react'
import { supabase, configError, errMsg } from './supabase'
import Login from './pages/Login'
import QuickAdd from './pages/QuickAdd'
import Records from './pages/Records'
import Goals from './pages/Goals'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

const TABS = [
  { id: 'add', label: '登録', ico: '＋' },
  { id: 'records', label: '記録', ico: '☰' },
  { id: 'goals', label: '目標', ico: '◎' },
  { id: 'reports', label: 'レポート', ico: '✎' },
  { id: 'settings', label: '設定', ico: '⚙' },
]

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = 確認中
  const [tab, setTab] = useState('add')
  const [members, setMembers] = useState([])
  const [memberId, setMemberId] = useState(null) // 画面をまたいで選択中メンバーを保持
  const [toast, setToast] = useState(null)

  const notify = useCallback((text, type = 'info') => {
    setToast({ text, type })
    setTimeout(() => setToast(null), type === 'error' ? 5000 : 2200)
  }, [])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadMembers = useCallback(async () => {
    const { data, error } = await supabase.from('members').select('*').order('sort_order').order('created_at')
    if (error) return notify(errMsg(error), 'error')
    setMembers(data)
    setMemberId((cur) => cur && data.some((m) => m.id === cur) ? cur : (data.find((m) => m.active)?.id ?? null))
  }, [notify])

  useEffect(() => { if (session) loadMembers() }, [session, loadMembers])

  if (configError) return <div className="login card">{configError}</div>
  if (session === undefined) return <div className="empty">読み込み中…</div>
  if (!session) return <Login />

  const active = members.filter((m) => m.active)
  const shared = { members: active, memberId, setMemberId, notify }

  return (
    <div className="app">
      <header className="topbar">
        <h1>GoodBad記録</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              <span className="ico" aria-hidden>{t.ico}</span>{t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="main">
        {active.length === 0 && tab !== 'settings' ? (
          <div className="card empty">
            メンバーが未登録です。<br />
            <button className="btn primary" style={{ marginTop: 12 }} onClick={() => setTab('settings')}>メンバーを登録する</button>
          </div>
        ) : (
          <>
            {tab === 'add' && <QuickAdd {...shared} />}
            {tab === 'records' && <Records {...shared} />}
            {tab === 'goals' && <Goals {...shared} />}
            {tab === 'reports' && <Reports {...shared} />}
            {tab === 'settings' && <Settings allMembers={members} reload={loadMembers} notify={notify} session={session} />}
          </>
        )}
      </main>
      {toast && <div className={`toast ${toast.type === 'error' ? 'error' : ''}`} role="status">{toast.text}</div>}
    </div>
  )
}
