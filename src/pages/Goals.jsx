// 半期目標：メンバー×半期ごとに複数の目標を登録・編集・削除する
import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../supabase'
import { MemberPicker, Pager, useGoals, Tally } from '../components'
import { currentHalfKey, shiftHalf, halfLabel, halfShortLabel, halfRange, toTs } from '../period'
import { encRow } from '../crypto'
// ※「前の半期からコピー」は暗号文のまま複製する（同じ鍵・同じ列なので復号できる）

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
    try {
      const row = await encRow('goals', { title: form.title.trim(), description: form.description.trim() || null })
      const { error } = editId
        ? await supabase.from('goals').update(row).eq('id', editId)
        : await supabase.from('goals').insert({ ...row, member_id: memberId, period_key: half, sort_order: goals.length })
      if (error) throw error
    } catch (e) {
      setBusy(false)
      return notify(errMsg(e), 'error')
    }
    setBusy(false)
    notify(editId ? '変更を保存しました' : '目標を追加しました')
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

  // この半期に各目標へ紐づいた Good/Bad の件数（暗号化していない列だけ読むので復号は不要）
  const [linked, setLinked] = useState({})
  useEffect(() => {
    if (!memberId) return
    let alive = true
    const [from, to] = halfRange(half)
    supabase.from('points').select('goal_id,kind').eq('member_id', memberId).not('goal_id', 'is', null)
      .gte('occurred_at', toTs(from)).lt('occurred_at', toTs(to))
      .then(({ data, error }) => {
        if (!alive || error) return
        const m = {}
        data.forEach((p) => { m[p.goal_id] ??= { good: 0, bad: 0 }; m[p.goal_id][p.kind]++ })
        setLinked(m)
      })
    return () => { alive = false }
  }, [memberId, half, goals])

  const who = members.find((m) => m.id === memberId)?.name ?? ''

  return (
    <>
      <section className="page-head">
        <MemberPicker members={members} memberId={memberId} setMemberId={setMemberId} />
        <h1 className="page-title">{who}さんの目標</h1>
      </section>

      <section className="sheet flush">
        <div style={{ padding: '12px 0 4px' }}>
          <Pager title={halfShortLabel(half)} onPrev={() => setHalf(shiftHalf(half, -1))} onNext={() => setHalf(shiftHalf(half, 1))} />
        </div>
        {goals.length === 0 ? (
          <div className="empty">
            この半期の目標はまだありません
            <div><button className="btn" onClick={copyPrev}>前の半期の目標をコピー</button></div>
          </div>
        ) : goals.map((g, i) => {
          const c = linked[g.id] || { good: 0, bad: 0 }
          return (
            <article className="goal" key={g.id}>
              <span className="goal-no">目標{i + 1}</span>
              <div className="goal-title">{g.title}</div>
              {g.description && <div className="goal-desc">{g.description}</div>}
              <div className="goal-tally">
                <span>{c.good > 0 && <Tally count={c.good} kind="good" label="Good" size={18} />}<span className="num">Good {c.good}件</span></span>
                <span>{c.bad > 0 && <Tally count={c.bad} kind="bad" label="Bad" size={18} />}<span className="num">Bad {c.bad}件</span></span>
              </div>
              <div className="goal-actions">
                <button className="link" onClick={() => { setEditId(g.id); setForm({ title: g.title, description: g.description || '' }) }}>編集</button>
                <button className="link danger" onClick={() => remove(g)}>削除</button>
              </div>
            </article>
          )
        })}
      </section>

      <section className="sheet stack">
        <h2 className="sheet-title" style={{ margin: 0 }}>{editId ? '目標を編集' : '目標を追加'}</h2>
        <label className="field">
          <span>目標</span>
          <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例）一次回答の平均時間を30分以内にする" />
        </label>
        <label className="field">
          <span>詳細・達成の基準</span>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="AIレポートは、ここに書いた基準も参考にして振り返ります" />
        </label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {editId && <button className="btn" onClick={() => { setEditId(null); setForm(blank) }}>キャンセル</button>}
          <button className="btn primary" onClick={save} disabled={busy}>{editId ? '変更を保存' : '目標を追加'}</button>
        </div>
      </section>
    </>
  )
}
