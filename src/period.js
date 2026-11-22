// 期間（日・月・半期）の計算。すべて日本時間（JST）基準。
// 半期は「年度の開始月」から6か月ずつ。開始月は設定画面で変えられる（初期値は4月）
//   例）開始月4月 … 上期 = 4〜9月（'2026H1'）、下期 = 10月〜翌3月（'2026H2'）
//   例）開始月1月 … 上期 = 1〜6月（'2026H1'）、下期 = 7〜12月（'2026H2'）
// 年度の数字は「その年度が始まった年」。画面とAPIサーバーの両方がこのファイルを使う
//
// 開始月の渡し方：
//   画面 … ログイン後に setFiscalStartMonth() で1回設定すれば、以降は省略できる
//   APIサーバー … 複数の利用者を同時に処理するため、関数の最後の引数で毎回明示する

const pad = (n) => String(n).padStart(2, '0')
const WEEK = ['日', '月', '火', '水', '木', '金', '土']

function jst(d = new Date()) {
  const s = new Date(new Date(d).getTime() + 9 * 3600e3)
  return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate(), w: s.getUTCDay(), hh: s.getUTCHours(), mm: s.getUTCMinutes() }
}

export const jstDateStr = (ts) => { const p = jst(ts); return `${p.y}-${pad(p.m)}-${pad(p.d)}` }
export const todayStr = () => jstDateStr(new Date())
export const toTs = (dateStr) => `${dateStr}T00:00:00+09:00`

// ---------- 年度の開始月 ----------
export const DEFAULT_FISCAL_START = 4
let fiscalStart = DEFAULT_FISCAL_START
export const normalizeStartMonth = (m) => (Number.isInteger(+m) && +m >= 1 && +m <= 12 ? +m : DEFAULT_FISCAL_START)
export const setFiscalStartMonth = (m) => { fiscalStart = normalizeStartMonth(m) }
export const getFiscalStartMonth = () => fiscalStart

// 月の通し番号（年*12 + 月-1）⇔ 'YYYY-MM-01'
const idxToDate = (idx) => `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}-01`

export function halfKeyOf(y, m, s = fiscalStart) {
  const fy = m >= s ? y : y - 1
  const offset = (m - s + 12) % 12 // 年度の何か月目か（0〜11）
  return `${fy}H${offset < 6 ? 1 : 2}`
}
export const currentHalfKey = (s = fiscalStart) => { const p = jst(); return halfKeyOf(p.y, p.m, s) }
export const currentMonthKey = () => { const p = jst(); return `${p.y}-${pad(p.m)}` }
export const halfKeyOfMonth = (monthKey, s = fiscalStart) => halfKeyOf(+monthKey.slice(0, 4), +monthKey.slice(5, 7), s)

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
// 半期の開始月の通し番号
const halfStartIdx = (key, s) => +key.slice(0, 4) * 12 + (s - 1) + (key.endsWith('H1') ? 0 : 6)
export function halfRange(key, s = fiscalStart) {
  const i = halfStartIdx(key, s)
  return [idxToDate(i), idxToDate(i + 6)]
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
// 年度の呼び方：1月始まりなら「2026年」、それ以外は「2026年度」
const yearLabel = (key, s) => `${key.slice(0, 4)}${s === 1 ? '年' : '年度'}`
// 半期の月の範囲（例：「10〜翌3月」）
export function halfMonthsLabel(key, s = fiscalStart) {
  const i = halfStartIdx(key, s), j = i + 5
  const fy = +key.slice(0, 4)
  const next = (idx) => (Math.floor(idx / 12) > fy ? '翌' : '')
  // 両端とも翌年なら「翌4〜9月」のように先頭にだけ付ける
  return `${next(i)}${(i % 12) + 1}〜${next(i) ? '' : next(j)}${(j % 12) + 1}月`
}
export const halfLabel = (key, s = fiscalStart) =>
  `${yearLabel(key, s)} ${key.endsWith('H1') ? '上期' : '下期'}（${halfMonthsLabel(key, s)}）`
export const timeLabel = (ts) => { const p = jst(ts); return `${pad(p.hh)}:${pad(p.mm)}` }
export const shortDate = (ts) => { const p = jst(ts); return `${p.m}/${p.d}（${WEEK[p.w]}）` }
// 画面の見出し用（狭いスマホ幅でも1行に収まる短い表記）。AIへの指示には halfLabel を使う
export const halfShortLabel = (key, s = fiscalStart) => `${yearLabel(key, s)} ${key.endsWith('H1') ? '上期' : '下期'}`
