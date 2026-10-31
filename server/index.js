// =============================================================
// GoodBad記録 API サーバー（Render の Web Service で動かす）
//
// 役割 :
//   1) データ暗号化用の鍵を、ログイン済みの許可ユーザーにだけ渡す（GET /api/data-key）
//   2) 月次／半期レポートを Claude API で要約し、暗号化して Supabase に保存する
// 起動 : node server/index.js         ※ローカルは cd server && npm run dev
// 環境変数（Render の Environment に登録）:
//   SUPABASE_URL, SUPABASE_ANON_KEY  … Supabase の接続情報（必須）
//   ANTHROPIC_API_KEY                … Claude API キー（必須）
//   ENCRYPTION_KEY                   … データ暗号化の鍵。32文字以上のランダム文字列（必須）
//                                      ★紛失・変更すると保存済みデータが読めなくなる。必ず控えを保管
//   ALLOWED_ORIGIN                   … 画面のURL。カンマ区切りで複数可（必須）
//   ALLOWED_EMAILS                   … 任意。設定すると、このメールアドレスのユーザーだけが鍵とAIを使える
//   ANTHROPIC_MODEL                  … 任意。未設定なら claude-sonnet-5-5
//   PORT                             … Render が自動設定
//
// 鍵を Supabase ではなくここ(Render)に置く理由：
//   DBの中身が漏れても、鍵が別の場所にあれば読めないため。
// DBアクセスは「ログイン中ユーザーの権限」で行う（service_role キーは使わない）。
// =============================================================
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { halfKeyOfMonth, halfRange, monthRange, monthLabel, halfLabel, jstDateStr, toTs } from '../src/period.js'
import { deriveKeyBytes, importKey, bytesToB64, decryptRows, encryptText } from '../src/cryptoCore.js'

// 「/rest/v1/」など余分なパスが付いていても動くよう、https://xxxx.supabase.co の部分だけを使う
const SUPABASE_URL = (() => { try { return new URL(process.env.SUPABASE_URL.trim()).origin } catch { return process.env.SUPABASE_URL } })()
const {
  SUPABASE_ANON_KEY, ANTHROPIC_API_KEY, ENCRYPTION_KEY,
  ANTHROPIC_MODEL = 'claude-sonnet-5-5', ALLOWED_ORIGIN = '', ALLOWED_EMAILS = '', PORT = 3001,
} = process.env

// 起動時に設定漏れを検知してログに出す（Render の Logs で確認できる）
const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ANTHROPIC_API_KEY', 'ENCRYPTION_KEY', 'ALLOWED_ORIGIN'].filter((k) => !process.env[k])
if (missing.length) console.error(`[設定エラー] 環境変数が未設定です: ${missing.join(', ')}`)

// 暗号鍵の準備（起動時に1回だけ）
let keyBytes = null, dataKey = null, keyError = null
try {
  if (ENCRYPTION_KEY) {
    keyBytes = await deriveKeyBytes(ENCRYPTION_KEY)
    dataKey = await importKey(keyBytes)
  }
} catch (e) {
  keyError = e.message
  console.error(`[設定エラー] ${e.message}`)
}

// 古い Node.js で動いていたら警告する（2026/10 の脆弱性修正版：22.23.4 / 24.22.1 / 26.12.1）
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
const allowedEmails = ALLOWED_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '50kb' }))

// ---------- 共通のセキュリティヘッダー ----------
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')          // 鍵やレポートをブラウザ・中継サーバーに残さない
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('Referrer-Policy', 'no-referrer')
  next()
})

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

// 死活確認用（Render のヘルスチェック・画面からのスリープ解除に使う）。設定値そのものは返さない
app.get('/healthz', (_req, res) => res.json({ ok: true, configured: missing.length === 0 && !keyError }))

// ---------- 認証（ログイン中ユーザーとして Supabase に接続） ----------
async function authenticate(req, res) {
  if (missing.length || keyError) {
    res.status(500).json({ error: `サーバーの設定が不足しています（${keyError || missing.join(', ')}）` })
    return null
  }
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'ログインが必要です' }); return null }
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await sb.auth.getUser(authHeader.slice(7))
  if (error || !data?.user) { res.status(401).json({ error: 'ログインの有効期限が切れています。再ログインしてください' }); return null }
  const email = (data.user.email || '').toLowerCase()
  if (allowedEmails.length && !allowedEmails.includes(email)) {
    console.warn(`[拒否] 許可されていないユーザー: ${email}`)
    res.status(403).json({ error: 'このアカウントには利用権限がありません' })
    return null
  }
  return { sb, user: data.user }
}

// ---------- 暗号鍵の受け渡し ----------
// ログイン済み・許可済みのユーザーにだけ返す。画面側は取り出し不可の鍵として端末内に保管する
app.get('/api/data-key', async (req, res) => {
  try {
    const auth = await authenticate(req, res)
    if (!auth) return
    console.log(`[鍵配布] ${auth.user.email} ${new Date().toISOString()}`) // 誰がいつ鍵を取得したかを記録
    res.json({ key: bytesToB64(keyBytes), version: 1 })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '鍵を取得できませんでした' })
  }
})

// ---------- レポート作成 ----------
app.post('/api/generate-report', async (req, res) => {
  const fail = (status, error) => res.status(status).json({ error })
  try {
    // 1) 入力チェック
    const { member_id, report_type, period_key } = req.body || {}
    if (!member_id || !report_type || !period_key) return fail(400, 'member_id / report_type / period_key は必須です')
    if (report_type === 'monthly' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period_key)) return fail(400, '月次の期間は YYYY-MM 形式です')
    if (report_type === 'half' && !/^\d{4}H[12]$/.test(period_key)) return fail(400, '半期の期間は 2026H2 のような形式です')
    if (!['monthly', 'half'].includes(report_type)) return fail(400, 'report_type は monthly か half です')

    // 2) 認証
    const auth = await authenticate(req, res)
    if (!auth) return
    const { sb, user } = auth

    // 3) 対象データ取得 → 復号
    const { data: memberRow, error: mErr } = await sb.from('members').select('id,name').eq('id', member_id).maybeSingle()
    if (mErr) throw new Error(`メンバー取得失敗: ${mErr.message}`)
    if (!memberRow) return fail(404, 'メンバーが見つかりません')
    const [member] = await decryptRows(dataKey, 'members', [memberRow])

    const [from, to] = report_type === 'monthly' ? monthRange(period_key) : halfRange(period_key)
    const halfKey = report_type === 'half' ? period_key : halfKeyOfMonth(period_key) // 月次でも所属半期の目標を使う

    const { data: goalRows, error: gErr } = await sb.from('goals').select('id,title,description')
      .eq('member_id', member_id).eq('period_key', halfKey).order('sort_order')
    if (gErr) throw new Error(`目標取得失敗: ${gErr.message}`)
    const goals = await decryptRows(dataKey, 'goals', goalRows)

    const { data: pointRows, error: pErr } = await sb.from('points').select('kind,content,occurred_at,goal_id')
      .eq('member_id', member_id).gte('occurred_at', toTs(from)).lt('occurred_at', toTs(to))
      .order('occurred_at').limit(MAX_POINTS)
    if (pErr) throw new Error(`記録取得失敗: ${pErr.message}`)
    if (!pointRows.length) return fail(400, 'この期間の記録が1件もないため、レポートを作成できません')
    const points = await decryptRows(dataKey, 'points', pointRows)

    // 4) プロンプト作成
    const { system, user: userMsg } = buildPrompt({ member, report_type, period_key, goals, points })

    // 5) Claude API 呼び出し（タイムアウト付き）
    let ai
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 4000, system, messages: [{ role: 'user', content: userMsg }] }),
      })
      if (!r.ok) {
        const raw = await r.text().catch(() => '')
        console.error('Claude API error', r.status, raw)
        // Claude API が返すエラー本文から原因を読み取り、画面に分かる言葉で出す
        let apiMsg = ''
        try { apiMsg = JSON.parse(raw)?.error?.message || '' } catch { /* 本文がJSONでない場合は番号のみ */ }
        const hint =
          /credit balance/i.test(apiMsg) ? '（Claude API のクレジット残高が不足しています。Anthropic Console の Billing でチャージしてください）'
          : /max_tokens/i.test(apiMsg) ? '（出力の上限設定がモデルに合っていません。管理者に連絡してください）'
          : r.status === 404 || /model/i.test(apiMsg) ? `（モデル名「${ANTHROPIC_MODEL}」が使えません。Render の ANTHROPIC_MODEL を確認してください）`
          : r.status === 401 ? '（APIキーが不正です。Render の ANTHROPIC_API_KEY を確認してください）'
          : r.status === 403 ? '（このAPIキーには利用権限がありません）'
          : r.status === 429 ? '（利用上限に達しています。少し待って再実行してください）'
          : r.status >= 500 ? '（AI側の一時的な障害です。再実行してください）'
          : apiMsg ? `（${apiMsg.slice(0, 200)}）` : ''
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

    // 6) 暗号化して保存（同じ期間のレポートは上書き）
    const { data: saved, error: sErr } = await sb.from('reports').upsert({
      owner_id: user.id, member_id, report_type, period_key,
      summary: await encryptText(dataKey, 'reports', 'summary', summary),
      source_count: points.length, model: ANTHROPIC_MODEL,
    }, { onConflict: 'owner_id,member_id,report_type,period_key' }).select().single()
    if (sErr) throw new Error(`レポート保存失敗: ${sErr.message}`)

    res.json({ report: { ...saved, summary } }) // 画面には平文で返す（HTTPSで暗号化された通信）
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
    return `- ${jstDateStr(p.occurred_at).replaceAll('-', '/')} ${p.kind === 'good' ? 'Good' : 'Bad'}${g}: ${String(p.content).replace(/\s+/g, ' ')}`
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
