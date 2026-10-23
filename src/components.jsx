// 各画面で共通して使う小さな部品
import { useEffect, useState } from 'react'
import { supabase, errMsg } from './supabase'

export function MemberPicker({ members, memberId, setMemberId }) {
  return (
    <div className="chips">
      {members.map((m) => (
        <button key={m.id} className={`chip ${m.id === memberId ? 'on' : ''}`} onClick={() => setMemberId(m.id)}>
          {m.name}
        </button>
      ))}
    </div>
  )
}

export function Pager({ title, onPrev, onNext, nextDisabled }) {
  return (
    <div className="pager">
      <button className="btn small" onClick={onPrev} aria-label="前へ">◀</button>
      <div className="title">{title}</div>
      <button className="btn small" onClick={onNext} disabled={nextDisabled} aria-label="次へ">▶</button>
    </div>
  )
}

export function Seg({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  )
}

// 指定メンバー・半期の目標を読み込む
export function useGoals(memberId, halfKey, notify) {
  const [goals, setGoals] = useState([])
  const [ver, setVer] = useState(0)
  useEffect(() => {
    if (!memberId) return setGoals([])
    let alive = true
    supabase.from('goals').select('*').eq('member_id', memberId).eq('period_key', halfKey)
      .order('sort_order').order('created_at')
      .then(({ data, error }) => {
        if (!alive) return
        if (error) notify(errMsg(error), 'error')
        else setGoals(data)
      })
    return () => { alive = false }
  }, [memberId, halfKey, ver, notify])
  return [goals, () => setVer((v) => v + 1)]
}

// AIレポート（Markdown）の簡易表示。外部ライブラリを増やさないため最小限の変換のみ
export function MarkdownView({ text }) {
  const lines = text.split('\n')
  const out = []
  let list = []
  const flush = () => { if (list.length) { out.push(<ul key={out.length}>{list}</ul>); list = [] } }
  const inline = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p)
  lines.forEach((raw, i) => {
    const l = raw.trimEnd()
    const h = l.match(/^#{1,4}\s+(.*)/)
    const li = l.match(/^\s*(?:[-*・]|\d+\.)\s+(.*)/)
    if (h) { flush(); out.push(<h3 key={i}>{inline(h[1])}</h3>) }
    else if (li) list.push(<li key={i}>{inline(li[1])}</li>)
    else if (l.trim() === '') flush()
    else { flush(); out.push(<p key={i}>{inline(l)}</p>) }
  })
  flush()
  return <div className="report">{out}</div>
}
