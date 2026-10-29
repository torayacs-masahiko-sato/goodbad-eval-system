// ログイン画面。
// 基本はパスキー（指紋・顔認証）でログインする。パスワードは
//   ・初回（まだパスキー未登録のとき）
//   ・機種変更などでパスキーが使えないとき
// のための予備として残している（パスキーだけにすると、端末紛失時にログインできなくなるため）
// アカウントはSupabaseダッシュボードで管理者が発行する（自己登録は不可）
import { useState } from 'react'
import { supabase, errMsg } from '../supabase'
import { passkeySupported, signInWithPasskey, passkeyErrMsg } from '../passkey'
import { BrandMark } from '../components'

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
    <div className="gate">
      <div className="gate-card">
        <div className="gate-brand">
          <BrandMark />
          <h1>GoodBad記録</h1>
          <p>気づいたその場で、メンバーの良かったこと・気になったことを書き留める手帳です。</p>
        </div>

        <div className="sheet stack">
          {supported ? (
            <>
              <button className="btn primary big" onClick={passkeyLogin} disabled={busy}>
                {busy && !showPassword ? '認証しています…' : 'パスキーでログイン'}
              </button>
              <p className="muted" style={{ margin: 0, textAlign: 'center' }}>指紋・顔認証・端末のPINを使います</p>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>このブラウザはパスキーに対応していないため、パスワードでログインしてください。</p>
          )}

          {error && <p className="error-text" role="alert">{error}</p>}

          {supported && !showPassword && (
            <button className="link" style={{ justifySelf: 'center' }} onClick={() => { setShowPassword(true); setError('') }}>
              初めての端末はパスワードでログイン
            </button>
          )}

          {showPassword && (
            <form onSubmit={passwordLogin} className="stack">
              {supported && <div className="divider">パスワードでログイン</div>}
              <label className="field">
                <span>メールアドレス</span>
                <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label className="field">
                <span>パスワード</span>
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              <button className="btn big" disabled={busy}>{busy ? 'ログインしています…' : 'ログイン'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
