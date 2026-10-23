// クイック登録：スマホで「メンバー → Good/Bad → 内容 → 登録」の最短手順で記録する
import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../supabase'
import { MemberPicker, useGoals } from '../components'
import { todayStr, halfKeyOf, shortDate, timeLabel } from '../period'

export default function QuickAdd({ members, memberId, setMemberId, notify }) {
  const [kind, setKind] = useState('good')
  const [content, setContent] = useState('')
  const [date, setDate] = useState(todayStr())
  const [goalId, setGoalId] = useState('')
  const [busy, setBusy] = useState(false)
  const [recent, setRecent] = useState([])

  // 選んだ日付が属する半期の目標を候補に出す
  const halfKey = halfKeyOf(+date.slice(0, 4), +date.slice(5, 7))
  const [goals] = useGoals(memberId, halfKey, notify)
  useEffect(() => { setGoalId('') }, [memberId, halfKey])

  const loadRecent = async () => {
    if (!memberId) return
    const { data, error } = await supabase.from('points').select('*').eq('member_id', memberId)
      .order('occurred_at', { ascending: false }).limit(5)
    if (error) notify(errMsg(error), 'error'); else setRecent(data)
  }
  useEffect(() => { loadRecent() }, [memberId]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!memberId) return notify('メンバーを選んでください', 'error')
    if (!content.trim()) return notify('内容を入力してください', 'error')
    setBusy(true)
    // 今日なら現在時刻、別の日なら正午として記録（日付の境目でずれないように）
    const occurred_at = date === todayStr() ? new Date().toISOString() : `${date}T12:00:00+09:00`
    const { error } = await supabase.from('points').insert({
      member_id: memberId, kind, content: content.trim(), occurred_at, goal_id: goalId || null,
    })
    setBusy(false)
    if (error) return notify(`登録できませんでした：${errMsg(error)}`, 'error') // 入力内容は消さずに残す
    notify('登録しました')
    setContent(''); setGoalId('')
    loadRecent()
  }

  return (
    <>
      <section className="card">
        <h2>誰の記録？</h2>
        <MemberPicker members={members} memberId={memberId} setMemberId={setMemberId} />

        <label className="label">種類</label>
        <div className="gb">
          <button className={`g ${kind === 'good' ? 'on' : ''}`} onClick={() => setKind('good')}>👍 Good</button>
          <button className={`b ${kind === 'bad' ? 'on' : ''}`} onClick={() => setKind('bad')}>⚠ Bad</button>
        </div>

        <label className="label">内容</label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)}
          placeholder="例）顧客からの難しい問い合わせに、手順書を確認しながら落ち着いて対応できていた" />

        <label className="label">関連する目標（任意）</label>
        <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
          <option value="">— 指定しない —</option>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
        {goals.length === 0 && <p className="muted">この半期の目標は未登録です（「目標」タブで登録できます）</p>}

        <label className="label">日付</label>
        <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} />

        <button className="btn primary block" style={{ marginTop: 16 }} onClick={save} disabled={busy}>
          {busy ? '登録中…' : '登録する'}
        </button>
      </section>

      <section className="card">
        <h2>最近の記録</h2>
        {recent.length === 0 ? <div className="empty">まだ記録がありません</div> : recent.map((p) => (
          <div className="entry" key={p.id}>
            <span className={`badge ${p.kind}`}>{p.kind === 'good' ? 'Good' : 'Bad'}</span>{' '}
            <span className="muted">{shortDate(p.occurred_at)} {timeLabel(p.occurred_at)}</span>
            <div className="body">{p.content}</div>
          </div>
        ))}
      </section>
    </>
  )
}
