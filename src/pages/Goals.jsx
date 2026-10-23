// 半期目標：メンバー×半期ごとに複数の目標を登録・編集・削除する
import { useState } from 'react'
import { supabase, errMsg } from '../supabase'
import { MemberPicker, Pager, useGoals } from '../components'
import { currentHalfKey, shiftHalf, halfLabel } from '../period'

const blank = { title: '', description: '' }

export default function Goals({ members, memberId, setMemberId, notify }) {
  const [half, setHalf] = useState(currentHalfKey())
  const [goals, reload] = useGoals(memberId, half, notify)
  const [form, setForm] = useState(blank)
  const [editId, setEditId] = useState(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!form.title.trim()) return notify('目標のタイトルを入力してください', 'error')
    setBusy(true)
    const row = { title: form.title.trim(), description: form.description.trim() || null }
    const { error } = editId
      ? await supabase.from('goals').update(row).eq('id', editId)
      : await supabase.from('goals').insert({ ...row, member_id: memberId, period_key: half, sort_order: goals.length })
    setBusy(false)
    if (error) return notify(errMsg(error), 'error')
    notify(editId ? '更新しました' : '追加しました')
    setForm(blank); setEditId(null); reload()
  }

  const remove = async (g) => {
    if (!window.confirm(`目標「${g.title}」を削除します。\n紐づいた記録は残り、「目標なし」になります。よろしいですか？`)) return
    const { error } = await supabase.from('goals').delete().eq('id', g.id)
    if (error) return notify(errMsg(error), 'error')
    notify('削除しました'); reload()
  }

  // 前の半期の目標を一括コピー（継続目標の入力を省く）
  const copyPrev = async () => {
    const prev = shiftHalf(half, -1)
    const { data, error } = await supabase.from('goals').select('title,description,sort_order')
      .eq('member_id', memberId).eq('period_key', prev).order('sort_order')
    if (error) return notify(errMsg(error), 'error')
    if (!data.length) return notify('前の半期に目標がありません', 'error')
    if (!window.confirm(`${halfLabel(prev)}の目標 ${data.length}件をコピーします。よろしいですか？`)) return
    const { error: e2 } = await supabase.from('goals').insert(data.map((g, i) => ({ ...g, member_id: memberId, period_key: half, sort_order: goals.length + i })))
    if (e2) return notify(errMsg(e2), 'error')
    notify('コピーしました'); reload()
  }

  return (
    <>
      <section className="card">
        <MemberPicker members={members} memberId={memberId} setMemberId={setMemberId} />
        <div style={{ marginTop: 12 }}>
          <Pager title={halfLabel(half)} onPrev={() => setHalf(shiftHalf(half, -1))} onNext={() => setHalf(shiftHalf(half, 1))} />
        </div>
      </section>

      <section className="card">
        <h2>登録済みの目標</h2>
        {goals.length === 0 ? (
          <div className="empty">
            この半期の目標はまだありません
            <div><button className="btn small" style={{ marginTop: 10 }} onClick={copyPrev}>前の半期からコピー</button></div>
          </div>
        ) : goals.map((g, i) => (
          <div className="entry" key={g.id}>
            <div className="row">
              <b className="grow">目標{i + 1}：{g.title}</b>
              <button className="btn small" onClick={() => { setEditId(g.id); setForm({ title: g.title, description: g.description || '' }) }}>編集</button>
              <button className="btn small danger" onClick={() => remove(g)}>削除</button>
            </div>
            {g.description && <div className="body muted">{g.description}</div>}
          </div>
        ))}
      </section>

      <section className="card">
        <h2>{editId ? '目標を編集' : '目標を追加'}</h2>
        <label className="label">タイトル</label>
        <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例）一次回答の平均時間を30分以内にする" />
        <label className="label">詳細・達成基準（任意）</label>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="AIレポートはここも参考にして評価します" />
        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          {editId && <button className="btn" onClick={() => { setEditId(null); setForm(blank) }}>キャンセル</button>}
          <button className="btn primary" onClick={save} disabled={busy}>{editId ? '更新' : '追加'}</button>
        </div>
      </section>
    </>
  )
}
