// 画面全体の枠組み：ログイン判定、タブ切替、メンバー一覧の共有、通知（トースト）
import { useCallback, useEffect, useState } from 'react'
import { supabase, configError, errMsg } from './supabase'
import Login from './pages/Login'
import QuickAdd from './pages/QuickAdd'
import Records from './pages/Records'
import Goals from './pages/Goals'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import { passkeySupported, listPasskeys, registerPasskey, passkeyErrMsg } from './passkey'
import { ensureKey, decRows, migratePlaintext } from './crypto'
import { Icon, BrandMark } from './components'

// 一定時間操作がなければ自動ログアウト（スマホの置き忘れ・共用PC対策）。
// パスキーなら再ログインは数秒なので、短めでも業務に支障が出にくい
const IDLE_LIMIT_MS = 12 * 60 * 60 * 1000 // 12時間
const ACTIVE_KEY = 'goodbad.lastActive'
const readLastActive = () => { try { return Number(localStorage.getItem(ACTIVE_KEY)) || 0 } catch { return 0 } }
const writeLastActive = () => { try { localStorage.setItem(ACTIVE_KEY, String(Date.now())) } catch { /* 記録できなくても動作に影響なし */ } }

// 「パスキー登録のおすすめ」を閉じたかどうか（この端末だけの記憶。使えない環境でも動作に影響しない）
const DISMISS_KEY = 'goodbad.passkeyPromptDismissed'
const isDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false } }
const setDismissed = () => { try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* 保存できなくても問題なし */ } }

const TABS = [
  { id: 'add', label: '登録', ico: 'pen' },
  { id: 'records', label: '記録', ico: 'list' },
  { id: 'goals', label: '目標', ico: 'goal' },
  { id: 'reports', label: 'レポート', ico: 'doc' },
  { id: 'settings', label: '設定', ico: 'gear' },
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

  const userId = session?.user?.id

  // ---------- 自動ログアウト ----------
  useEffect(() => {
    if (!userId) return
    const last = readLastActive()
    if (last && Date.now() - last > IDLE_LIMIT_MS) {
      supabase.auth.signOut() // 端末内の暗号鍵は残す（次回ログインを早くするため。鍵だけではDBは読めない）
      return
    }
    writeLastActive()
    let lastWrite = Date.now()
    const touch = () => { if (Date.now() - lastWrite > 60_000) { lastWrite = Date.now(); writeLastActive() } }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - readLastActive() > IDLE_LIMIT_MS) supabase.auth.signOut()
      else touch()
    }
    window.addEventListener('pointerdown', touch)
    window.addEventListener('keydown', touch)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('pointerdown', touch)
      window.removeEventListener('keydown', touch)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId])

  // ---------- 暗号鍵の準備 → 既存の平文データを暗号化 ----------
  const [keyState, setKeyState] = useState('loading') // 'loading' | 'ready' | エラーメッセージ
  const [keyTry, setKeyTry] = useState(0)
  useEffect(() => {
    if (!userId) return
    let alive = true
    setKeyState('loading')
    ensureKey(userId)
      .then(() => {
        if (!alive) return
        setKeyState('ready')
        migratePlaintext()
          .then((n) => { if (n) notify(`保存済みデータ ${n}件を暗号化しました`) })
          .catch((e) => console.error('暗号化の移行に失敗', e)) // 次回ログイン時に再実行される
      })
      .catch((e) => { if (alive) setKeyState(errMsg(e)) })
    return () => { alive = false }
  }, [userId, keyTry, notify])

  const loadMembers = useCallback(async () => {
    const { data, error } = await supabase.from('members').select('*').order('sort_order').order('created_at')
    if (error) return notify(errMsg(error), 'error')
    const rows = await decRows('members', data)
    setMembers(rows)
    setMemberId((cur) => cur && rows.some((m) => m.id === cur) ? cur : (rows.find((m) => m.active)?.id ?? null))
  }, [notify])

  useEffect(() => { if (session && keyState === 'ready') loadMembers() }, [session, keyState, loadMembers])

  // パスキー未登録なら、登録をおすすめするカードを出す
  const [suggestPasskey, setSuggestPasskey] = useState(false)
  const checkPasskeys = useCallback(async () => {
    if (!passkeySupported() || isDismissed()) return setSuggestPasskey(false)
    try { setSuggestPasskey((await listPasskeys()).length === 0) }
    catch { setSuggestPasskey(false) } // パスキー機能が無効な場合などは何も出さない
  }, [])
  useEffect(() => { if (userId) checkPasskeys() }, [userId, checkPasskeys])

  const quickRegister = async () => {
    try { await registerPasskey(); notify('パスキーを登録しました。次回から指紋・顔認証でログインできます'); setSuggestPasskey(false) }
    catch (e) { const m = passkeyErrMsg(e); if (m) notify(m, 'error') }
  }

  if (configError) return <div className="gate"><div className="gate-card sheet">{configError}</div></div>
  if (session === undefined) return <div className="gate"><div className="muted">読み込み中…</div></div>
  if (!session) return <Login />
  if (keyState !== 'ready') {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="gate-brand"><BrandMark /></div>
          <div className="sheet stack">
            {keyState === 'loading' ? (
              <>
                <b>データを開いています</b>
                <p className="muted" style={{ margin: 0 }}>この端末で初めて使うときは、サーバーの起動待ちで最大1分ほどかかります。</p>
                <div className="progress" aria-hidden="true" />
              </>
            ) : (
              <>
                <b>データを開けませんでした</b>
                <p className="error-text">{keyState}</p>
                <div className="row">
                  <button className="btn primary" onClick={() => setKeyTry((n) => n + 1)}>再試行</button>
                  <button className="btn" onClick={() => supabase.auth.signOut()}>ログアウト</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const active = members.filter((m) => m.active)
  const shared = { members: active, memberId, setMemberId, notify }

  return (
    <div className="app">
      <div className="side">
        <header className="masthead">
          <span className="brand"><BrandMark />GoodBad記録</span>
        </header>
        <nav className="nav" aria-label="メニュー">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <Icon name={t.ico} />{t.label}
            </button>
          ))}
        </nav>
      </div>
      <main className="main">
        {suggestPasskey && (
          <div className="notice">
            <b>次回から指紋・顔認証でログインできます</b>
            <p className="muted" style={{ margin: 0 }}>この端末をパスキーに登録すると、パスワードの入力が不要になります。</p>
            <div className="row">
              <button className="btn primary" onClick={quickRegister}>この端末を登録</button>
              <button className="btn" onClick={() => { setDismissed(); setSuggestPasskey(false) }}>今はしない</button>
            </div>
          </div>
        )}
        {active.length === 0 && tab !== 'settings' ? (
          <div className="sheet empty">
            <b style={{ color: 'var(--ink)', fontSize: 16 }}>最初に、記録するメンバーを登録しましょう</b>
            <div><button className="btn primary" onClick={() => setTab('settings')}>メンバーを登録</button></div>
          </div>
        ) : (
          <>
            {tab === 'add' && <QuickAdd {...shared} />}
            {tab === 'records' && <Records {...shared} />}
            {tab === 'goals' && <Goals {...shared} />}
            {tab === 'reports' && <Reports {...shared} />}
            {tab === 'settings' && <Settings allMembers={members} reload={loadMembers} notify={notify} session={session} onPasskeyChange={checkPasskeys} />}
          </>
        )}
      </main>
      {toast && <div className={`toast ${toast.type === 'error' ? 'error' : ''}`} role="status">{toast.text}</div>}
    </div>
  )
}
