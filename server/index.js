// =============================================================
// GoodBad記録 API サーバー（Render の Web Service で動かす）
//
// 役割 : 月次／半期レポートを Claude API で要約し、Supabase に保存する
//        （APIキーをブラウザに出さないため、要約だけはサーバー側で行う）
// 起動 : node server/index.js         ※ローカルは cd server && npm run dev
// 環境変数（Render の Environment に登録）:
//   SUPABASE_URL, SUPABASE_ANON_KEY  … Supabase の接続情報（必須）
//   ANTHROPIC_API_KEY                … Claude API キー（必須）
//   ANTHROPIC_MODEL                  … 任意。未設定なら claude-sonnet-5-5
//   ALLOWED_ORIGIN                   … 画面のURL。カンマ区切りで複数可（必須）
//   PORT                             … Render が自動設定
//
// DBアクセスは「ログイン中ユーザーの権限」で行うため、RLSにより他人のデータには触れない。
// （service_role キーはあえて使わない：漏えい時の被害を最小にするため）
// =============================================================
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { halfKeyOfMonth, halfRange, monthRange, monthLabel, halfLabel, jstDateStr, toTs } from '../src/period.js'

// 「/rest/v1/」など余分なパスが付いていても動くよう、https://xxxx.supabase.co の部分だけを使う
const SUPABASE_URL = (() => { try { return new URL(process.env.SUPABASE_URL.trim()).origin } catch { return process.env.SUPABASE_URL } })()
const {
  SUPABASE_ANON_KEY, ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL = 'claude-sonnet-5-5', ALLOWED_ORIGIN = '', PORT = 3001,
} = process.env

// 起動時に設定漏れを検知してログに出す（Render の Logs で確認できる）
const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ANTHROPIC_API_KEY', 'ALLOWED_ORIGIN'].filter((k) => !process.env[k])
if (missing.length) console.error(`[設定エラー] 環境変数が未設定です: ${missing.join(', ')}`)

// 古い Node.js で動いていたら警告する（2026/10 の脆弱性修正版：22.23.4 / 24.22.1 / 26.12.1）
// 起動は止めない：業務を止めるより、ログで気づいて更新する方が実害が小さいため
{
  const FIXED = { 22: [23, 4], 24: [22, 1], 26: [12, 1] }
  const [maj, min, pat] = process.versions.node.split('.').map(Number)
  const f = FIXED[maj]
  const ok = f ? (min > f[0] || (min === f[0] && pat >= f[1])) : maj > 26
  if (!ok) console.error(`[セキュリティ警告] Node.js ${process.versions.node} は既知の脆弱性の修正前です。Render で「Clear build cache & deploy」を実行してください`)
}

const MAX_POINTS = 1500
const CLAUDE_TIMEOUT_MS = 90_000
const origins = ALLOWED_ORIGIN.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)

const app = express()
app.use(express.json({ limit: '50kb' }))

// ---------- CORS（許可した画面URLからの呼び出しだけ通す） ----------
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && origins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Vary', 'Origin')
    res.set('Access-Control-Allow-Headers', 'authorization, content-type')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && origins.includes(origin) ? 204 : 403)
  next()
})

// 死活確認用（Render のヘルスチェック・画面からのスリープ解除に使う）
app.get('/healthz', (_req, res) => res.json({ ok: true, configured: missing.length === 0 }))

// ---------- レポート作成 ----------
app.post('/api/generate-report', async (req, res) => {
  const fail = (status, error) => res.status(status).json({ error })
  try {
    if (missing.length) return fail(500, `サーバーの環境変数が未設定です（${missing.join(', ')}）`)

    // 1) 入力チェック
    const { member_id, report_type, period_key } = req.body || {}
    if (!member_id || !report_type || !period_key) return fail(400, 'member_id / report_type / period_key は必須です')
    if (report_type === 'monthly' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period_key)) return fail(400, '月次の期間は YYYY-MM 形式です')
    if (report_type === 'half' && !/^\d{4}H[12]$/.test(period_key)) return fail(400, '半期の期間は 2026H2 のような形式です')
    if (!['monthly', 'half'].includes(report_type)) return fail(400, 'report_type は monthly か half です')

    // 2) ログイン中ユーザーとしてDB接続
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return fail(401, 'ログインが必要です')
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: userData, error: userErr } = await sb.auth.getUser(authHeader.slice(7))
    if (userErr || !userData?.user) return fail(401, 'ログインの有効期限が切れています。再ログインしてください')
    const userId = userData.user.id

    // 3) 対象データ取得
    const { data: member, error: mErr } = await sb.from('members').select('id,name').eq('id', member_id).maybeSingle()
    if (mErr) throw new Error(`メンバー取得失敗: ${mErr.message}`)
    if (!member) return fail(404, 'メンバーが見つかりません')

    const [from, to] = report_type === 'monthly' ? monthRange(period_key) : halfRange(period_key)
    const halfKey = report_type === 'half' ? period_key : halfKeyOfMonth(period_key) // 月次でも所属半期の目標を使う

    const { data: goals, error: gErr } = await sb.from('goals').select('id,title,description')
      .eq('member_id', member_id).eq('period_key', halfKey).order('sort_order')
    if (gErr) throw new Error(`目標取得失敗: ${gErr.message}`)

    const { data: points, error: pErr } = await sb.from('points').select('kind,content,occurred_at,goal_id')
      .eq('member_id', member_id).gte('occurred_at', toTs(from)).lt('occurred_at', toTs(to))
      .order('occurred_at').limit(MAX_POINTS)
    if (pErr) throw new Error(`記録取得失敗: ${pErr.message}`)
    if (!points.length) return fail(400, 'この期間の記録が1件もないため、レポートを作成できません')

    // 4) プロンプト作成
    const { system, user } = buildPrompt({ member, report_type, period_key, goals, points })

    // 5) Claude API 呼び出し（タイムアウト付き）
    let ai
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 4000, system, messages: [{ role: 'user', content: user }] }),
      })
      if (!r.ok) {
        console.error('Claude API error', r.status, await r.text().catch(() => ''))
        const hint = r.status === 401 ? '（APIキーが不正です）'
          : r.status === 429 ? '（利用上限に達しています。少し待って再実行してください）'
          : r.status >= 500 ? '（AI側の一時的な障害です。再実行してください）' : ''
        return fail(502, `AIでの要約に失敗しました ${r.status}${hint}`)
      }
      ai = await r.json()
    } catch (e) {
      return fail(504, e.name === 'TimeoutError'
        ? 'AIの応答が時間内に返りませんでした。時間をおいて再実行してください'
        : `AIへの接続に失敗しました: ${e.message}`)
    }
    const summary = (ai.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim()
    if (!summary) return fail(502, 'AIから空の応答が返りました。再実行してください')

    // 6) 保存（同じ期間のレポートは上書き）
    const { data: saved, error: sErr } = await sb.from('reports').upsert({
      owner_id: userId, member_id, report_type, period_key, summary, source_count: points.length, model: ANTHROPIC_MODEL,
    }, { onConflict: 'owner_id,member_id,report_type,period_key' }).select().single()
    if (sErr) throw new Error(`レポート保存失敗: ${sErr.message}`)

    res.json({ report: saved })
  } catch (e) {
    console.error(e)
    fail(500, e.message || '不明なエラー')
  }
})

export function buildPrompt({ member, report_type, period_key, goals, points }) {
  const goalTitle = new Map(goals.map((g) => [g.id, g.title]))
  const goalText = goals.length
    ? goals.map((g, i) => `目標${i + 1}: ${g.title}${g.description ? `\n  詳細: ${g.description}` : ''}`).join('\n')
    : '（この半期の目標は未登録）'
  const good = points.filter((p) => p.kind === 'good').length
  const records = points.map((p) => {
    const g = p.goal_id && goalTitle.get(p.goal_id) ? ` [目標: ${goalTitle.get(p.goal_id)}]` : ''
    return `- ${jstDateStr(p.occurred_at).replaceAll('-', '/')} ${p.kind === 'good' ? 'Good' : 'Bad'}${g}: ${p.content.replace(/\s+/g, ' ')}`
  }).join('\n')
  const label = report_type === 'monthly' ? monthLabel(period_key) : halfLabel(period_key)
  const kindName = report_type === 'monthly' ? '月次レポート' : '半期レポート'

  const system =
    'あなたは管理職の部下育成を支援するアシスタントです。' +
    'マネージャーが記録した日々の観察メモ（Good/Bad）を、評価面談や振り返りに使えるレポートにまとめます。\n' +
    '守ること:\n' +
    '- 記録に書かれた事実だけを根拠にする。書かれていない出来事・性格・健康・私生活などを推測しない\n' +
    '- 具体例を挙げるときは日付を添える\n' +
    '- Badは人格ではなく行動として扱い、改善のための建設的な表現にする\n' +
    '- 記録が少ない目標は「記録が少なく判断材料が不足」と明記する\n' +
    '- 日本語で、Markdownの見出しと箇条書きを使う'
  const user =
    `対象者: ${member.name}\n期間: ${label}\n記録件数: ${points.length}件（Good ${good} / Bad ${points.length - good}）\n` +
    (points.length >= MAX_POINTS ? `※記録が多いため先頭${MAX_POINTS}件のみ\n` : '') +
    `\n## 半期目標\n${goalText}\n\n## 記録\n${records}\n\n` +
    `上記をもとに${kindName}を作成してください。構成:\n` +
    '1. 総評（3〜4行）\n2. 目標ごとの振り返り（達成に向けた良い点・課題・根拠となる記録）\n' +
    '3. 目標以外で目立ったGood\n4. 改善が望まれる点\n' +
    (report_type === 'monthly' ? '5. 来月に意識してほしいこと（2〜3点）' : '5. 次の半期に向けた提案（目標設定のヒントを含む）')
  return { system, user }
}

app.listen(PORT, () => console.log(`GoodBad API listening on :${PORT}`))
