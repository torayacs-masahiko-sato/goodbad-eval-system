// 設定：メンバーの追加・名前変更・並び順・非表示、ログアウト
import { useState } from 'react'
import { supabase, errMsg } from '../supabase'

export default function Settings({ allMembers, reload, notify, session }) {
  const [name, setName] = useState('')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')

  const add = async () => {
    if (!name.trim()) return
    const { error } = await supabase.from('members').insert({ name: name.trim(), sort_order: allMembers.length })
    if (error) return notify(errMsg(error), 'error')
    setName(''); notify('追加しました'); reload()
  }
  const update = async (id, row, msg = '更新しました') => {
    const { error } = await supabase.from('members').update(row).eq('id', id)
    if (error) return notify(errMsg(error), 'error')
    notify(msg); reload()
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
      <section className="card">
        <h2>メンバー</h2>
        <div className="row">
          <input type="text" className="grow" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="氏名を入力" onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && add()} />
          <button className="btn primary" onClick={add}>追加</button>
        </div>
        <div style={{ marginTop: 8 }}>
          {allMembers.length === 0 && <div className="empty">まだメンバーがいません</div>}
          {allMembers.map((m, i) => (
            <div className="entry row" key={m.id} style={{ opacity: m.active ? 1 : 0.5 }}>
              {editId === m.id ? (
                <>
                  <input type="text" className="grow" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <button className="btn small primary" onClick={() => { if (editName.trim()) { update(m.id, { name: editName.trim() }); setEditId(null) } }}>保存</button>
                  <button className="btn small" onClick={() => setEditId(null)}>戻る</button>
                </>
              ) : (
                <>
                  <span className="grow">{m.name}{!m.active && '（非表示）'}</span>
                  <button className="btn small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="上へ">↑</button>
                  <button className="btn small" onClick={() => move(i, 1)} disabled={i === allMembers.length - 1} aria-label="下へ">↓</button>
                  <button className="btn small" onClick={() => { setEditId(m.id); setEditName(m.name) }}>名前</button>
                  <button className="btn small" onClick={() => update(m.id, { active: !m.active }, m.active ? '非表示にしました' : '再表示しました')}>
                    {m.active ? '非表示' : '再表示'}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <p className="muted">異動・退職したメンバーは「非表示」にしてください。記録とレポートは残ります。</p>
      </section>

      <section className="card">
        <h2>アカウント</h2>
        <p className="muted">{session.user.email} でログイン中</p>
        <button className="btn" onClick={() => supabase.auth.signOut()}>ログアウト</button>
      </section>
    </>
  )
}
