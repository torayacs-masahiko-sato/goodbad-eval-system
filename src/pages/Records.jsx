// 記録一覧：メンバーごとに 日別 / 月別 / 半期別 で表示。編集・削除もここで行う
import { useEffect, useMemo, useState } from 'react'
import { supabase, errMsg } from '../supabase'
import { MemberPicker, Pager, Seg } from '../components'
import {
  todayStr, currentMonthKey, currentHalfKey, dayRange, monthRange, halfRange, shiftDay, shiftMonth, shiftHalf,
  dayLabel, monthLabel, halfLabel, jstDateStr, timeLabel, toTs, halfKeyOf, halfKeyOfMonth,
} from '../period'

export default function Records({ members, memberId, setMemberId, notify }) {
  const [mode, setMode] = useState('month')
  const [day, setDay] = useState(todayStr())
  const [month, setMonth] = useState(currentMonthKey())
  const [half, setHalf] = useState(currentHalfKey())
  const [kindFilter, setKindFilter] = useState('all')
  const [goalFilter, setGoalFilter] = useState('')
  const [points, setPoints] = useState([])
  const [allGoals, setAllGoals] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)

  const [from, to, title, halfOfView] = mode === 'day'
    ? [...dayRange(day), dayLabel(day), halfKeyOf(+day.slice(0, 4), +day.slice(5, 7))]
    : mode === 'month'
      ? [...monthRange(month), monthLabel(month), halfKeyOfMonth(month)]
      : [...halfRange(half), halfLabel(half), half]

  const load = async () => {
    if (!memberId) return
    setLoading(true)
    const [p, g] = await Promise.all([
      supabase.from('points').select('*').eq('member_id', memberId)
        .gte('occurred_at', toTs(from)).lt('occurred_at', toTs(to))
        .order('occurred_at', { ascending: false }),
      supabase.from('goals').select('id,title,period_key').eq('member_id', memberId),
    ])
    setLoading(false)
    if (p.error || g.error) return notify(errMsg(p.error || g.error), 'error')
    setPoints(p.data); setAllGoals(g.data)
  }
  useEffect(() => { load() }, [memberId, from, to]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setGoalFilter('') }, [memberId, halfOfView])

  const goalName = useMemo(() => new Map(allGoals.map((g) => [g.id, g.title])), [allGoals])
  const goalsOfView = allGoals.filter((g) => g.period_key === halfOfView)
  const shown = points.filter((p) =>
    (kindFilter === 'all' || p.kind === kindFilter) && (!goalFilter || p.goal_id === goalFilter))
  const good = points.filter((p) => p.kind === 'good').length

  // 日付ごとにまとめる
  const groups = []
  shown.forEach((p) => {
    const d = jstDateStr(p.occurred_at)
    if (!groups.length || groups[groups.length - 1].d !== d) groups.push({ d, items: [] })
    groups[groups.length - 1].items.push(p)
  })

  const move = (n) => {
    if (mode === 'day') setDay(shiftDay(day, n))
    else if (mode === 'month') setMonth(shiftMonth(month, n))
    else setHalf(shiftHalf(half, n))
  }
  const atLatest = mode === 'day' ? day >= todayStr() : mode === 'month' ? month >= currentMonthKey() : half >= currentHalfKey()

  const remove = async (p) => {
    if (!window.confirm('この記録を削除します。元に戻せません。よろしいですか？')) return
    const { error } = await supabase.from('points').delete().eq('id', p.id)
    if (error) return notify(errMsg(error), 'error')
    notify('削除しました'); load()
  }
  const saveEdit = async () => {
    if (!editing.content.trim()) return notify('内容が空です', 'error')
    const { error } = await supabase.from('points').update({
      kind: editing.kind, content: editing.content.trim(), goal_id: editing.goal_id || null,
    }).eq('id', editing.id)
    if (error) return notify(errMsg(error), 'error')
    setEditing(null); notify('更新しました'); load()
  }

  return (
    <>
      <section className="card">
        <MemberPicker members={members} memberId={memberId} setMemberId={setMemberId} />
        <div style={{ marginTop: 12 }}>
          <Seg value={mode} onChange={setMode} options={[['day', '日別'], ['month', '月別'], ['half', '半期別']]} />
        </div>
        <div style={{ marginTop: 12 }}>
          <Pager title={title} onPrev={() => move(-1)} onNext={() => move(1)} nextDisabled={atLatest} />
        </div>
      </section>

      <section className="card">
        <div className="stats">
          <div className="stat"><b>{points.length}</b><span className="muted">合計</span></div>
          <div className="stat good"><b>{good}</b><span className="muted">Good</span></div>
          <div className="stat bad"><b>{points.length - good}</b><span className="muted">Bad</span></div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <select className="grow" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="all">Good/Bad すべて</option>
            <option value="good">Goodのみ</option>
            <option value="bad">Badのみ</option>
          </select>
          <select className="grow" value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)}>
            <option value="">目標：すべて</option>
            {goalsOfView.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </div>
      </section>

      <section className="card">
        {loading ? <div className="empty">読み込み中…</div>
          : groups.length === 0 ? <div className="empty">この期間の記録はありません</div>
          : groups.map((grp) => (
            <div className="daygroup" key={grp.d}>
              {mode !== 'day' && <h3>{dayLabel(grp.d)}</h3>}
              {grp.items.map((p) => editing?.id === p.id ? (
                <div className="entry" key={p.id}>
                  <div className="gb">
                    <button className={`g ${editing.kind === 'good' ? 'on' : ''}`} onClick={() => setEditing({ ...editing, kind: 'good' })}>Good</button>
                    <button className={`b ${editing.kind === 'bad' ? 'on' : ''}`} onClick={() => setEditing({ ...editing, kind: 'bad' })}>Bad</button>
                  </div>
                  <textarea style={{ marginTop: 8 }} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
                  <select style={{ marginTop: 8 }} value={editing.goal_id || ''} onChange={(e) => setEditing({ ...editing, goal_id: e.target.value })}>
                    <option value="">— 目標なし —</option>
                    {allGoals.filter((g) => g.period_key === halfKeyOf(+jstDateStr(p.occurred_at).slice(0, 4), +jstDateStr(p.occurred_at).slice(5, 7)))
                      .map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </select>
                  <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
                    <button className="btn small" onClick={() => setEditing(null)}>キャンセル</button>
                    <button className="btn small primary" onClick={saveEdit}>保存</button>
                  </div>
                </div>
              ) : (
                <div className="entry" key={p.id}>
                  <div className="row">
                    <span className={`badge ${p.kind}`}>{p.kind === 'good' ? 'Good' : 'Bad'}</span>
                    {p.goal_id && goalName.get(p.goal_id) && <span className="badge goal">{goalName.get(p.goal_id)}</span>}
                    <span className="muted grow">{timeLabel(p.occurred_at)}</span>
                    <button className="btn small" onClick={() => setEditing({ ...p })}>編集</button>
                    <button className="btn small danger" onClick={() => remove(p)}>削除</button>
                  </div>
                  <div className="body">{p.content}</div>
                </div>
              ))}
            </div>
          ))}
      </section>
    </>
  )
}
