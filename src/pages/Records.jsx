// 記録一覧：メンバーごとに 日別 / 月別 / 半期別 で表示。編集・削除もここで行う
import { useEffect, useMemo, useState } from 'react'
import { supabase, errMsg } from '../supabase'
import { MemberPicker, Pager, Seg, Score, MonthRhythm } from '../components'
import {
  todayStr, currentMonthKey, currentHalfKey, dayRange, monthRange, halfRange, shiftDay, shiftMonth, shiftHalf,
  dayLabel, monthLabel, halfLabel, halfShortLabel, jstDateStr, timeLabel, toTs, halfKeyOf, halfKeyOfMonth,
} from '../period'
import { encRow, decRows } from '../crypto'

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
      : [...halfRange(half), halfShortLabel(half), half]

  const load = async () => {
    if (!memberId) return
    setLoading(true)
    const [p, g] = await Promise.all([
      supabase.from('points').select('*').eq('member_id', memberId)
        .gte('occurred_at', toTs(from)).lt('occurred_at', toTs(to))
        .order('occurred_at', { ascending: false }),
      supabase.from('goals').select('id,title,period_key').eq('member_id', memberId),
    ])
    if (p.error || g.error) { setLoading(false); return notify(errMsg(p.error || g.error), 'error') }
    const [pts, gls] = await Promise.all([decRows('points', p.data), decRows('goals', g.data)])
    setLoading(false)
    setPoints(pts); setAllGoals(gls)
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
    try {
      const { error } = await supabase.from('points').update(await encRow('points', {
        kind: editing.kind, content: editing.content.trim(), goal_id: editing.goal_id || null,
      })).eq('id', editing.id)
      if (error) throw error
    } catch (e) { return notify(errMsg(e), 'error') }
    setEditing(null); notify('変更を保存しました'); load()
  }

  const who = members.find((m) => m.id === memberId)?.name ?? ''
  const goalsForDate = (ts) => {
    const d = jstDateStr(ts)
    return allGoals.filter((g) => g.period_key === halfKeyOf(+d.slice(0, 4), +d.slice(5, 7)))
  }

  return (
    <>
      <section className="page-head">
        <MemberPicker members={members} memberId={memberId} setMemberId={setMemberId} />
        <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
          <h1 className="page-title">{who}</h1>
          <Seg label="表示する期間" value={mode} onChange={setMode} options={[['day', '日'], ['month', '月'], ['half', '半期']]} />
        </div>
      </section>

      <section className="sheet stack">
        <Pager title={title} onPrev={() => move(-1)} onNext={() => move(1)} nextDisabled={atLatest} />
        <Score good={good} bad={points.length - good} />
        {mode === 'month' && (
          <MonthRhythm monthKey={month} points={points} today={todayStr()}
            onPickDay={(d) => { setDay(d); setMode('day') }} />
        )}
      </section>

      <section className="sheet flush" aria-label="記録の一覧">
        <div className="row" style={{ padding: '12px 0 4px' }}>
          <select className="grow" aria-label="Good/Badで絞り込み" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="all">GoodとBad</option>
            <option value="good">Goodだけ</option>
            <option value="bad">Badだけ</option>
          </select>
          <select className="grow" aria-label="目標で絞り込み" value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)}>
            <option value="">すべての目標</option>
            {goalsOfView.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </div>

        {loading ? <div className="empty">読み込んでいます…</div>
          : groups.length === 0 ? <div className="empty">この期間の記録はありません</div>
          : groups.map((grp) => (
            <div key={grp.d}>
              {mode !== 'day' && <h3 className="day-head num">{dayLabel(grp.d)}</h3>}
              {grp.items.map((p) => editing?.id === p.id ? (
                <article className={`note ${editing.kind} editing stack`} key={p.id}>
                  <div className="kind" role="group" aria-label="種類">
                    <button type="button" className="good" aria-pressed={editing.kind === 'good'} onClick={() => setEditing({ ...editing, kind: 'good' })}><b>Good</b></button>
                    <button type="button" className="bad" aria-pressed={editing.kind === 'bad'} onClick={() => setEditing({ ...editing, kind: 'bad' })}><b>Bad</b></button>
                  </div>
                  <textarea className="ruled" aria-label="内容" value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
                  <select aria-label="関連する目標" value={editing.goal_id || ''} onChange={(e) => setEditing({ ...editing, goal_id: e.target.value })}>
                    <option value="">目標なし</option>
                    {goalsForDate(p.occurred_at).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </select>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn" onClick={() => setEditing(null)}>キャンセル</button>
                    <button className="btn primary" onClick={saveEdit}>変更を保存</button>
                  </div>
                </article>
              ) : (
                <article className={`note ${p.kind}`} key={p.id}>
                  <div className="note-meta">
                    <span className="note-kind">{p.kind === 'good' ? 'Good' : 'Bad'}</span>
                    <span className="num">{timeLabel(p.occurred_at)}</span>
                    <span className="note-actions">
                      <button className="link" onClick={() => setEditing({ ...p })}>編集</button>
                      <button className="link danger" onClick={() => remove(p)}>削除</button>
                    </span>
                  </div>
                  <div className="note-body">{p.content}</div>
                  {p.goal_id && goalName.get(p.goal_id) && <div style={{ marginTop: 6 }}><span className="note-goal">目標：{goalName.get(p.goal_id)}</span></div>}
                </article>
              ))}
            </div>
          ))}
      </section>
    </>
  )
}
