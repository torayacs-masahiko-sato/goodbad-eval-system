// クイック登録：スマホで「メンバー → Good/Bad → 内容 → 登録」の最短手順で記録する
import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../supabase'
import { MemberPicker, useGoals, Score } from '../components'
import { todayStr, halfKeyOf, shortDate, timeLabel, jstDateStr, toTs } from '../period'
import { encRow, decRows } from '../crypto'

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
    // 今月分（正の字の集計用）。一覧には新しい順に5件だけ出す
    const { data, error } = await supabase.from('points').select('*').eq('member_id', memberId)
      .gte('occurred_at', toTs(todayStr().slice(0, 7) + '-01'))
      .order('occurred_at', { ascending: false }).limit(1000)
    if (error) notify(errMsg(error), 'error'); else setRecent(await decRows('points', data))
  }
  useEffect(() => { loadRecent() }, [memberId]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!memberId) return notify('メンバーを選んでください', 'error')
    if (!content.trim()) return notify('内容を入力してください', 'error')
    setBusy(true)
    // 今日なら現在時刻、別の日なら正午として記録（日付の境目でずれないように）
    const occurred_at = date === todayStr() ? new Date().toISOString() : `${date}T12:00:00+09:00`
    try {
      const { error } = await supabase.from('points').insert(await encRow('points', {
        member_id: memberId, kind, content: content.trim(), occurred_at, goal_id: goalId || null,
      }))
      if (error) throw error
    } catch (e) {
      setBusy(false)
      return notify(`登録できませんでした：${errMsg(e)}`, 'error') // 入力内容は消さずに残す
    }
    setBusy(false)
    notify(`${kind === 'good' ? 'Good' : 'Bad'}として記録しました`)
    setContent(''); setGoalId('')
    loadRecent()
  }

  const who = members.find((m) => m.id === memberId)?.name ?? ''
  const thisMonth = todayStr().slice(0, 7)
  const monthGood = recent.filter((p) => p.kind === 'good' && jstDateStr(p.occurred_at).startsWith(thisMonth)).length
  const monthBad = recent.filter((p) => p.kind === 'bad' && jstDateStr(p.occurred_at).startsWith(thisMonth)).length

  return (
    <>
      <section className="page-head">
        <h1 className="page-title">気づいたことを書き留める</h1>
        <MemberPicker members={members} memberId={memberId} setMemberId={setMemberId} />
      </section>

      <section className="sheet stack" aria-label={`${who}さんの記録を書く`}>
        <div className="kind" role="group" aria-label="種類">
          <button type="button" className="good" aria-pressed={kind === 'good'} onClick={() => setKind('good')}>
            <b>Good</b><small>良かったこと</small>
          </button>
          <button type="button" className="bad" aria-pressed={kind === 'bad'} onClick={() => setKind('bad')}>
            <b>Bad</b><small>気になったこと</small>
          </button>
        </div>

        <label className="field">
          <span>{who}さんの{kind === 'good' ? '良かったこと' : '気になったこと'}</span>
          <textarea className="ruled" value={content} onChange={(e) => setContent(e.target.value)}
            placeholder={kind === 'good'
              ? '例）難しい問い合わせに、手順書を確認しながら落ち着いて対応できていた'
              : '例）お客様への折り返し連絡が、約束の時間より1時間遅れていた'} />
        </label>

        <div className="two">
          <label className="field">
            <span>関連する目標</span>
            <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">指定しない</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </label>
          <label className="field">
            <span>日付</span>
            <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} />
          </label>
        </div>
        {goals.length === 0 && <p className="muted" style={{ margin: 0 }}>この半期の目標はまだありません。「目標」から登録できます。</p>}

        <button className={`btn big ${kind === 'good' ? 'as-good' : 'as-bad'}`} onClick={save} disabled={busy}>
          {busy ? '記録しています…' : `${kind === 'good' ? 'Good' : 'Bad'}として記録`}
        </button>
      </section>

      <section className="sheet">
        <h2 className="sheet-title">{who}さんの今月</h2>
        <Score good={monthGood} bad={monthBad} size={22} />
      </section>

      <section className="sheet flush" aria-label="最近の記録">
        {recent.length === 0 ? <div className="empty">今月の記録はまだありません。気づいたことを1件書いてみましょう。</div> : recent.slice(0, 5).map((p) => (
          <article className={`note ${p.kind}`} key={p.id}>
            <div className="note-meta">
              <span className="note-kind">{p.kind === 'good' ? 'Good' : 'Bad'}</span>
              <span className="num">{shortDate(p.occurred_at)} {timeLabel(p.occurred_at)}</span>
            </div>
            <div className="note-body">{p.content}</div>
          </article>
        ))}
      </section>
    </>
  )
}
