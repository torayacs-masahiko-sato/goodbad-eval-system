// レポート：月次／半期のAI要約を作成・閲覧する。全員分の一括作成も可能
import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../supabase'
import { MemberPicker, Pager, Seg, MarkdownView } from '../components'
import { currentMonthKey, currentHalfKey, shiftMonth, shiftHalf, monthLabel, halfShortLabel } from '../period'
import { decRow } from '../crypto'

// Render 上の API サーバーのURL（末尾の / は除く）
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

// Render無料プランは15分アクセスがないとスリープし、起動に30〜60秒かかる。
// レポート画面を開いた時点で起こしておき、ボタンを押したときの待ち時間を減らす
function wakeApi() {
  if (API_URL) fetch(`${API_URL}/healthz`).catch(() => { /* 起こすだけなので失敗は無視 */ })
}

// API サーバーを呼ぶ。失敗時はサーバー側の日本語メッセージを取り出して返す
async function generate(member_id, report_type, period_key) {
  if (!API_URL) throw new Error('環境変数 VITE_API_URL が設定されていません（README参照）')
  const { data: s } = await supabase.auth.getSession()
  if (!s.session) throw new Error('ログインの有効期限が切れました。再ログインしてください')
  let res
  try {
    res = await fetch(`${API_URL}/api/generate-report`, {
      method: 'POST',
      signal: AbortSignal.timeout(180_000), // スリープ復帰(〜60秒)＋AI要約(〜90秒)を見込む
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session.access_token}` },
      body: JSON.stringify({ member_id, report_type, period_key }),
    })
  } catch (e) {
    throw new Error(e.name === 'TimeoutError'
      ? '時間内に応答がありませんでした。サーバー起動中の可能性があるので、1分ほど待って再実行してください'
      : 'サーバーに接続できませんでした。少し待って再実行してください')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `サーバーエラー（${res.status}）`)
  return body.report
}

export default function Reports({ members, memberId, setMemberId, notify }) {
  const [type, setType] = useState('monthly')
  const [month, setMonth] = useState(currentMonthKey())
  const [half, setHalf] = useState(currentHalfKey())
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('') // 実行中の説明文

  const key = type === 'monthly' ? month : half
  const label = type === 'monthly' ? monthLabel(month) : halfShortLabel(half)

  const load = async () => {
    if (!memberId) return
    setLoading(true)
    const { data, error } = await supabase.from('reports').select('*')
      .eq('member_id', memberId).eq('report_type', type).eq('period_key', key).maybeSingle()
    if (error) { setLoading(false); return notify(errMsg(error), 'error') }
    const row = await decRow('reports', data)
    setLoading(false)
    setReport(row)
  }
  useEffect(() => { load() }, [memberId, type, key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { wakeApi() }, [])

  const runOne = async () => {
    if (report && !window.confirm('既存のレポートを作り直して上書きします。よろしいですか？')) return
    setBusy('AIが要約しています…（30秒〜1分半ほどかかります）')
    try {
      setReport(await generate(memberId, type, key))
      notify('レポートを作成しました')
    } catch (e) {
      notify(errMsg(e), 'error')
    } finally { setBusy('') }
  }

  // 全員分を1人ずつ順番に作成（同時に投げるとAPIの利用上限にかかりやすいため）
  const runAll = async () => {
    if (!window.confirm(`${label}の${type === 'monthly' ? '月次' : '半期'}レポートを、全員分（${members.length}人）作成します。\n既存のレポートは上書きされます。`)) return
    const failed = []
    for (let i = 0; i < members.length; i++) {
      setBusy(`作成中… ${i + 1}/${members.length}人目（${members[i].name}）`)
      try { await generate(members[i].id, type, key) }
      catch (e) { failed.push(`${members[i].name}：${errMsg(e)}`) }
    }
    setBusy('')
    load()
    if (failed.length) window.alert(`作成できなかったメンバー：\n${failed.join('\n')}`)
    else notify('全員分を作成しました')
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(report.summary); notify('本文をコピーしました') }
    catch { notify('コピーできませんでした。本文を長押しして選択してください', 'error') }
  }

  const who = members.find((m) => m.id === memberId)?.name ?? ''

  return (
    <>
      <section className="page-head">
        <MemberPicker members={members} memberId={memberId} setMemberId={setMemberId} />
        <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
          <h1 className="page-title">{who}さんのレポート</h1>
          <Seg label="レポートの種類" value={type} onChange={setType} options={[['monthly', '月次'], ['half', '半期']]} />
        </div>
      </section>

      <section className="sheet stack">
        {type === 'monthly'
          ? <Pager title={label} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} nextDisabled={month >= currentMonthKey()} />
          : <Pager title={label} onPrev={() => setHalf(shiftHalf(half, -1))} onNext={() => setHalf(shiftHalf(half, 1))} nextDisabled={half >= currentHalfKey()} />}
        <div className="row">
          <button className="btn primary grow" onClick={runOne} disabled={!!busy}>{report ? 'レポートを作り直す' : 'レポートを作成'}</button>
          <button className="btn" onClick={runAll} disabled={!!busy}>全員分を作成</button>
        </div>
        {busy && (
          <div aria-live="polite">
            <p className="muted" style={{ margin: 0 }}>{busy}</p>
            <div className="progress" aria-hidden="true" />
          </div>
        )}
      </section>

      <article className="sheet">
        {loading ? <div className="empty">読み込んでいます…</div> : !report ? (
          <div className="empty">この期間のレポートはまだありません。記録をもとにAIが要約します。</div>
        ) : (
          <>
            <div className="doc-meta">
              <span className="grow num">
                {new Date(report.updated_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' })} 作成　記録{report.source_count}件から要約
              </span>
              <button className="link" onClick={copy}>本文をコピー</button>
            </div>
            <MarkdownView text={report.summary} />
            <p className="doc-note">AIによる要約です。評価に使う前に、元の記録と照らして内容を確認してください。</p>
          </>
        )}
      </article>
    </>
  )
}
