// ログイン画面。
// 基本はパスキー（指紋・顔認証）でログインする。パスワードは
//   ・初回（まだパスキー未登録のとき）
//   ・機種変更などでパスキーが使えないとき
// のための予備として残している（パスキーだけにすると、端末紛失時にログインできなくなるため）
// アカウントはSupabaseダッシュボードで管理者が発行する（自己登録は不可）
import { useState } from 'react'
import { supabase, errMsg } from '../supabase'
import { passkeySupported, signInWithPasskey, passkeyErrMsg } from '../passkey'

export default function Login() {
  const supported = passkeySupported()
  const [showPassword, setShowPassword] = useState(!supported)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const passkeyLogin = async () => {
    setBusy(true); setError('')
    try {
      await signInWithPasskey() // 成功すると App 側がログイン状態を検知して画面が切り替わる
    } catch (e) {
      const m = passkeyErrMsg(e)
      if (m) setError(m)
    } finally { setBusy(false) }
  }

  const passwordLogin = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(errMsg(error))
  }

  return (
    <div className="login card">
      <h2 style={{ fontSize: 18 }}>GoodBad記録 ログイン</h2>

      {supported ? (
        <>
          <button className="btn primary block" onClick={passkeyLogin} disabled={busy}>
            {busy && !showPassword ? '認証中…' : '🔑 パスキーでログイン'}
          </button>
          <p className="muted" style={{ marginTop: 8 }}>指紋・顔認証・端末のPINでログインします</p>
        </>
      ) : (
        <p className="muted">このブラウザはパスキーに対応していないため、パスワードでログインしてください。</p>
      )}

      {error && <p style={{ color: 'var(--bad)', fontSize: 14 }}>{error}</p>}

      {supported && !showPassword && (
        <button className="btn block" style={{ marginTop: 16 }} onClick={() => { setShowPassword(true); setError('') }}>
          パスワードでログイン（初回・パスキー未登録の端末）
        </button>
      )}

      {showPassword && (
        <form onSubmit={passwordLogin} style={{ marginTop: supported ? 16 : 0, borderTop: supported ? '1px solid var(--line)' : 0, paddingTop: supported ? 4 : 0 }}>
          <label className="label">メールアドレス</label>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="label">パスワード</label>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn block" style={{ marginTop: 16 }} disabled={busy}>
            {busy ? 'ログイン中…' : 'パスワードでログイン'}
          </button>
        </form>
      )}
    </div>
  )
}
