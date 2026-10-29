// 設定：メンバーの追加・名前変更・並び順・非表示、ログアウト
import { useState } from 'react'
import { supabase, errMsg } from '../supabase'
import PasskeySection from '../PasskeySection'
import { encRow, clearKey } from '../crypto'

export default function Settings({ allMembers, reload, notify, session, onPasskeyChange }) {
  const [name, setName] = useState('')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')

  const add = async () => {
    if (!name.trim()) return
    try {
      const { error } = await supabase.from('members').insert(await encRow('members', { name: name.trim(), sort_order: allMembers.length }))
      if (error) throw error
      setName(''); notify('追加しました'); reload()
    } catch (e) { notify(errMsg(e), 'error') }
  }
  const update = async (id, row, msg = '更新しました') => {
    try {
      const { error } = await supabase.from('members').update(await encRow('members', row)).eq('id', id)
      if (error) throw error
      notify(msg); reload()
    } catch (e) { notify(errMsg(e), 'error') }
  }
  // 手動ログアウト：この端末から暗号鍵も消す（共用PC・端末を手放すとき用）
  const logout = async () => {
    await clearKey()
    await supabase.auth.signOut()
  }
  // 並べ替え：隣のメンバーと順番を入れ替える
  const move = async (i, dir) => {
    const a = allMembers[i], b = allMembers[i + dir]
    if (!b) return
    const r1 = await supabase.from('members').update({ sort_order: i + dir }).eq('id', a.id)
    const r2 = await supabase.from('members').update({ sort_order: i }).eq('id', b.id)
    if (r1.error || r2.error) notify(errMsg(r1.error || r2.error), 'error')
    reload()
  }

  return (
    <>
      <section className="page-head">
        <h1 className="page-title">設定</h1>
      </section>

      <section className="sheet">
        <h2 className="sheet-title">メンバー</h2>
        <div className="row">
          <input type="text" className="grow" aria-label="追加するメンバーの氏名" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="氏名" onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && add()} />
          <button className="btn primary" onClick={add}>メンバーを追加</button>
        </div>
        <div style={{ marginTop: 8 }}>
          {allMembers.length === 0 && <div className="empty">記録したいメンバーの氏名を入力してください</div>}
          {allMembers.map((m, i) => (
            <div className="note row" key={m.id} style={{ paddingLeft: 0, opacity: m.active ? 1 : 0.55 }}>
              {editId === m.id ? (
                <>
                  <input type="text" className="grow" aria-label="氏名" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <button className="btn primary" onClick={() => { if (editName.trim()) { update(m.id, { name: editName.trim() }); setEditId(null) } }}>保存</button>
                  <button className="btn" onClick={() => setEditId(null)}>キャンセル</button>
                </>
              ) : (
                <>
                  <span className="grow" style={{ fontWeight: 500 }}>{m.name}{!m.active && <span className="muted">（非表示）</span>}</span>
                  <span className="note-actions">
                    <button className="link" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${m.name}を上へ`}>↑</button>
                    <button className="link" onClick={() => move(i, 1)} disabled={i === allMembers.length - 1} aria-label={`${m.name}を下へ`}>↓</button>
                    <button className="link" onClick={() => { setEditId(m.id); setEditName(m.name) }}>名前を変更</button>
                    <button className="link" onClick={() => update(m.id, { active: !m.active }, m.active ? '非表示にしました' : '表示に戻しました')}>
                      {m.active ? '非表示' : '表示に戻す'}
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>異動・退職したメンバーは「非表示」にしてください。記録とレポートは残ります。</p>
      </section>

      <PasskeySection notify={notify} onChange={onPasskeyChange} />

      <section className="sheet">
        <h2 className="sheet-title">アカウント</h2>
        <p className="muted" style={{ marginTop: 0 }}>{session.user.email} でログイン中</p>
        <button className="btn" onClick={logout}>ログアウト</button>
        <p className="muted" style={{ marginBottom: 0 }}>12時間操作がないと自動でログアウトします。保存データは暗号化され、鍵はSupabaseとは別のサーバーで管理しています。</p>
      </section>
    </>
  )
}
