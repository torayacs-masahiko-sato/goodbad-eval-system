// 期間（日・月・半期）の計算。すべて日本時間（JST）基準。
// 半期: 上期 = 4〜9月（'2026H1'）、下期 = 10月〜翌3月（'2026H2'）
// ※ 年度の切り方を変える場合はこのファイルと Edge Function の同名関数を合わせて修正する

const pad = (n) => String(n).padStart(2, '0')
const WEEK = ['日', '月', '火', '水', '木', '金', '土']

function jst(d = new Date()) {
  const s = new Date(new Date(d).getTime() + 9 * 3600e3)
  return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate(), w: s.getUTCDay(), hh: s.getUTCHours(), mm: s.getUTCMinutes() }
}

export const jstDateStr = (ts) => { const p = jst(ts); return `${p.y}-${pad(p.m)}-${pad(p.d)}` }
export const todayStr = () => jstDateStr(new Date())
export const toTs = (dateStr) => `${dateStr}T00:00:00+09:00`

export function halfKeyOf(y, m) {
  if (m >= 4 && m <= 9) return `${y}H1`
  if (m >= 10) return `${y}H2`
  return `${y - 1}H2`
}
export const currentHalfKey = () => { const p = jst(); return halfKeyOf(p.y, p.m) }
export const currentMonthKey = () => { const p = jst(); return `${p.y}-${pad(p.m)}` }
export const halfKeyOfMonth = (monthKey) => halfKeyOf(+monthKey.slice(0, 4), +monthKey.slice(5, 7))

// 各期間の [開始日, 終了日の翌日) を 'YYYY-MM-DD' で返す
export function dayRange(ds) {
  const d = new Date(ds + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)
  return [ds, d.toISOString().slice(0, 10)]
}
export function monthRange(key) {
  let [y, m] = key.split('-').map(Number)
  const s = `${y}-${pad(m)}-01`
  m++; if (m > 12) { m = 1; y++ }
  return [s, `${y}-${pad(m)}-01`]
}
export function halfRange(key) {
  const y = +key.slice(0, 4)
  return key.endsWith('H1') ? [`${y}-04-01`, `${y}-10-01`] : [`${y}-10-01`, `${y + 1}-04-01`]
}

// 前後への移動
export function shiftDay(ds, n) {
  const d = new Date(ds + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export function shiftMonth(key, n) {
  const [y, m] = key.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`
}
export function shiftHalf(key, n) {
  const idx = +key.slice(0, 4) * 2 + (key.endsWith('H1') ? 0 : 1) + n
  return `${Math.floor(idx / 2)}H${(idx % 2) + 1}`
}

// 表示用
export const dayLabel = (ds) => { const p = jst(toTs(ds)); return `${p.y}/${pad(p.m)}/${pad(p.d)}（${WEEK[p.w]}）` }
export const monthLabel = (key) => `${key.slice(0, 4)}年${+key.slice(5, 7)}月`
export const halfLabel = (key) => `${key.slice(0, 4)}年度 ${key.endsWith('H1') ? '上期（4〜9月）' : '下期（10〜翌3月）'}`
export const timeLabel = (ts) => { const p = jst(ts); return `${pad(p.hh)}:${pad(p.mm)}` }
export const shortDate = (ts) => { const p = jst(ts); return `${p.m}/${p.d}（${WEEK[p.w]}）` }
