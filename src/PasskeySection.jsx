// 設定画面の「パスキー」欄：このデバイスの登録、登録済み一覧、名前変更、削除
import { useEffect, useState } from 'react'
import { passkeySupported, listPasskeys, registerPasskey, renamePasskey, deletePasskey, passkeyErrMsg } from './passkey'

const fmt = (ts) => ts ? new Date(ts).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }) : '—'

export default function PasskeySection({ notify, onChange }) {
  const supported = passkeySupported()
  const [keys, setKeys] = useState(null) // null = 読み込み中
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')

  const load = async () => {
    try { setKeys(await listPasskeys()); setLoadError('') }
    catch (e) { setKeys([]); setLoadError(passkeyErrMsg(e) || '一覧を取得できませんでした') }
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    setBusy(true)
    try {
      await registerPasskey()
      notify('このデバイスをパスキーに登録しました')
      await load(); onChange?.()
    } catch (e) {
      const m = passkeyErrMsg(e)
      if (m) notify(m, 'error')
    } finally { setBusy(false) }
  }

  const rename = async (k) => {
    const name = window.prompt('このパスキーの名前（例：会社PC、iPhone）', k.friendly_name || '')
    if (name === null || !name.trim()) return
    try { await renamePasskey(k.id, name.trim().slice(0, 120)); notify('名前を変更しました'); load() }
    catch (e) { notify(passkeyErrMsg(e) || '変更できませんでした', 'error') }
  }

  const remove = async (k) => {
    const last = keys.length === 1
    if (!window.confirm(`パスキー「${k.friendly_name || '名称なし'}」を削除します。${last ? '\n※最後の1件です。削除後はパスワードでのログインになります。' : ''}\nよろしいですか？`)) return
    try { await deletePasskey(k.id); notify('削除しました'); await load(); onChange?.() }
    catch (e) { notify(passkeyErrMsg(e) || '削除できませんでした', 'error') }
  }

  return (
    <section className="card">
      <h2>パスキー（指紋・顔認証ログイン）</h2>
      {!supported ? (
        <p className="muted">このブラウザはパスキーに対応していません。</p>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            使う端末（PC・スマホ）ごとに登録してください。iPhoneとMacなど、同じアカウントで同期される端末は1回の登録で使える場合があります。
          </p>
          <button className="btn primary block" onClick={add} disabled={busy}>
            {busy ? '登録中…' : '＋ このデバイスを登録する'}
          </button>
        </>
      )}

      <div style={{ marginTop: 8 }}>
        {keys === null ? <div className="empty">読み込み中…</div>
          : loadError ? <p style={{ color: 'var(--bad)', fontSize: 14 }}>{loadError}</p>
          : keys.length === 0 ? <div className="empty">登録済みのパスキーはありません</div>
          : keys.map((k) => (
            <div className="entry row" key={k.id}>
              <div className="grow">
                <b>{k.friendly_name || '名称なし'}</b>
                <div className="muted">登録 {fmt(k.created_at)}／最終利用 {fmt(k.last_used_at)}</div>
              </div>
              <button className="btn small" onClick={() => rename(k)}>名前</button>
              <button className="btn small danger" onClick={() => remove(k)}>削除</button>
            </div>
          ))}
      </div>
      <p className="muted">端末を紛失・機種変更したときは、ここで古いパスキーを削除してください。パスワードでのログインは予備として引き続き使えます。</p>
    </section>
  )
}
