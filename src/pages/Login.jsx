// ログイン画面。アカウントはSupabaseダッシュボードで管理者が発行する（自己登録は不可）
import { useState } from 'react'
import { supabase, errMsg } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(errMsg(error))
  }

  return (
    <form className="login card" onSubmit={submit}>
      <h2 style={{ fontSize: 18 }}>GoodBad記録 ログイン</h2>
      <label className="label">メールアドレス</label>
      <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label className="label">パスワード</label>
      <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p style={{ color: 'var(--bad)', fontSize: 14 }}>{error}</p>}
      <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy}>
        {busy ? 'ログイン中…' : 'ログイン'}
      </button>
    </form>
  )
}
