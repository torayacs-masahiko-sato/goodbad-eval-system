// 各画面で共通して使う部品
import { useEffect, useState } from 'react'
import { supabase, errMsg } from './supabase'
import { decRows } from './crypto'

// ---------- アイコン（線画。色は文字色に従う） ----------
const ICONS = {
  pen: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  goal: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-1.7 1l-.3 2h-4l-.3-2a7 7 0 0 1-1.7-1l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3L3 9.3l2-3.4 1.9.7a7 7 0 0 1 1.7-1l.3-2h4l.3 2a7 7 0 0 1 1.7 1l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3z',
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
}
export function Icon({ name }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} /></svg>
}

// ---------- ロゴ（正の字） ----------
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="62%" height="62%"><path d="M5 5H19M12 5V19M12 12H17.5M7 12V19M4 19H20" /></svg>
    </span>
  )
}

// ---------- 正の字で件数を描く ----------
// 正 の書き順どおりに1画ずつ増える。5件で「正」1文字
const STROKES = ['M4 4.5H20', 'M12 4.5V19.5', 'M12 12H18', 'M6.5 12V19.5', 'M3 19.5H21']
const MAX_GLYPHS = 24 // これを超える分は「+数字」で表示（画面が埋まらないように）
export function Tally({ count, kind, label, size = 24 }) {
  const full = Math.floor(count / 5)
  const rem = count % 5
  const groups = Array.from({ length: Math.min(full, MAX_GLYPHS) }, () => 5)
  if (rem && full < MAX_GLYPHS) groups.push(rem)
  const overflow = count - groups.reduce((a, b) => a + b, 0)
  return (
    <span className={`tally ${kind || ''}`} role="img" aria-label={`${label} ${count}件`}>
      {count === 0 ? <span className="tally-zero">まだありません</span> : groups.map((n, gi) => (
        <svg key={gi} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          {STROKES.slice(0, n).map((d, si) => (
            <path key={si} d={d} pathLength="1" style={{ '--i': gi * 5 + si }} />
          ))}
        </svg>
      ))}
      {overflow > 0 && <span className="tally-more num">+{overflow}</span>}
    </span>
  )
}

// Good/Bad の件数を正の字で並べる
export function Score({ good, bad, size }) {
  return (
    <div className="score">
      <div className="score-row">
        <span className="who good">Good</span>
        <Tally count={good} kind="good" label="Good" size={size} />
        <span className="count num">{good}<small>件</small></span>
      </div>
      <div className="score-row">
        <span className="who bad">Bad</span>
        <Tally count={bad} kind="bad" label="Bad" size={size} />
        <span className="count num">{bad}<small>件</small></span>
      </div>
    </div>
  )
}

// ---------- 月のリズム：日ごとの Good（上）/ Bad（下） ----------
// 日をクリックするとその日の記録へ移動する
export function MonthRhythm({ monthKey, points, today, onPickDay }) {
  const [hover, setHover] = useState(null)
  const y = +monthKey.slice(0, 4), m = +monthKey.slice(5, 7)
  const days = new Date(y, m, 0).getDate()
  const counts = Array.from({ length: days }, () => ({ g: 0, b: 0 }))
  points.forEach((p) => {
    const d = new Date(new Date(p.occurred_at).getTime() + 9 * 3600e3).getUTCDate()
    if (counts[d - 1]) counts[d - 1][p.kind === 'good' ? 'g' : 'b']++
  })
  const max = Math.max(1, ...counts.map((c) => Math.max(c.g, c.b)))
  const ds = (d) => `${monthKey}-${String(d).padStart(2, '0')}`
  const tip = hover === null ? '日付を選ぶと、その日の記録を表示します'
    : `${m}月${hover + 1}日　Good ${counts[hover].g}件　Bad ${counts[hover].b}件`
  return (
    <div className="rhythm">
      <div className="rhythm-bars" onMouseLeave={() => setHover(null)}>
        {counts.map((c, i) => (
          <button key={i} type="button" className={`rhythm-day ${ds(i + 1) === today ? 'today' : ''}`}
            aria-label={`${m}月${i + 1}日 Good ${c.g}件 Bad ${c.b}件`}
            onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            onClick={() => onPickDay(ds(i + 1))}>
            <span className="up" style={{ height: `${(c.g / max) * 100}%` }} />
            <span className="mid" />
            <span className="down" style={{ height: `${(c.b / max) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="rhythm-axis num" aria-hidden="true">
        {counts.map((_, i) => <span key={i}>{[1, 10, 20, days].includes(i + 1) ? i + 1 : ''}</span>)}
      </div>
      <div className="rhythm-tip" aria-live="polite">{tip}</div>
    </div>
  )
}

// ---------- 名札（メンバー選択） ----------
export function MemberPicker({ members, memberId, setMemberId }) {
  return (
    <div className="names" role="group" aria-label="メンバー">
      {members.map((m) => (
        <button key={m.id} type="button" className="name" aria-pressed={m.id === memberId} onClick={() => setMemberId(m.id)}>
          {m.name}
        </button>
      ))}
    </div>
  )
}

export function Pager({ title, onPrev, onNext, nextDisabled }) {
  return (
    <div className="pager">
      <button type="button" className="icon-btn" onClick={onPrev} aria-label="前の期間"><Icon name="prev" /></button>
      <div className="title num" aria-live="polite">{title}</div>
      <button type="button" className="icon-btn" onClick={onNext} disabled={nextDisabled} aria-label="次の期間"><Icon name="next" /></button>
    </div>
  )
}

export function Seg({ value, onChange, options, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>
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
      .then(async ({ data, error }) => {
        if (!alive) return
        if (error) return notify(errMsg(error), 'error')
        const rows = await decRows('goals', data)
        if (alive) setGoals(rows)
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
  return <div className="doc">{out}</div>
}
