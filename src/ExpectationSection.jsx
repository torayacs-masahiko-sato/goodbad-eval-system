// 目標画面の上部：マネージャーがメンバーに「期待していること」「なってほしい姿」
// メンバー×半期で1件。目標より上位の考え方なので、目標の上に置く
import { useEffect, useState } from 'react'
import { supabase, errMsg } from './supabase'
import { encRow, decRow } from './crypto'
import { shiftHalf, halfShortLabel } from './period'

const blank = { expectation: '', vision: '' }

export default function ExpectationSection({ memberId, who, half, notify }) {
  const [row, setRow] = useState(null)      // 保存済みの内容（null = 未登録）
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true); setEditing(false)
    const { data, error } = await supabase.from('expectations').select('*')
      .eq('member_id', memberId).eq('period_key', half).maybeSingle()
    if (error) { setLoading(false); return notify(errMsg(error), 'error') }
    const r = await decRow('expectations', data)
    setRow(r); setLoading(false)
  }
  useEffect(() => { if (memberId) load() }, [memberId, half]) // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (src = row) => {
    setForm({ expectation: src?.expectation || '', vision: src?.vision || '' })
    setEditing(true)
  }

  const save = async () => {
    const values = { expectation: form.expectation.trim() || null, vision: form.vision.trim() || null }
    if (!values.expectation && !values.vision) return notify('どちらか一方は入力してください', 'error')
    setBusy(true)
    try {
      const enc = await encRow('expectations', values)
      const { error } = row?.id
        ? await supabase.from('expectations').update(enc).eq('id', row.id)
        : await supabase.from('expectations').insert({ ...enc, member_id: memberId, period_key: half })
      if (error) throw error
      notify('期待・なってほしい姿を保存しました')
      await load()
    } catch (e) {
      notify(errMsg(e), 'error') // 入力内容は残す
    } finally { setBusy(false) }
  }

  // 前の半期の内容を下書きとして読み込む（そのまま保存はしない。見直してから保存してもらう）
  const loadPrev = async () => {
    const prev = shiftHalf(half, -1)
    const { data, error } = await supabase.from('expectations').select('*')
      .eq('member_id', memberId).eq('period_key', prev).maybeSingle()
    if (error) return notify(errMsg(error), 'error')
    if (!data) return notify(`${halfShortLabel(prev)}の登録はありません`, 'error')
    startEdit(await decRow('expectations', data))
    notify(`${halfShortLabel(prev)}の内容を読み込みました。見直してから保存してください`)
  }

  if (loading) return <section className="sheet"><div className="empty">読み込んでいます…</div></section>

  return (
    <section className="sheet stack vision" aria-label="期待していること・なってほしい姿">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="sheet-title" style={{ margin: 0 }}>{who}さんへの期待</h2>
        {!editing && row && <button className="link" onClick={() => startEdit()}>編集</button>}
      </div>

      {editing ? (
        <>
          <label className="field">
            <span>期待していること</span>
            <textarea value={form.expectation} onChange={(e) => setForm({ ...form, expectation: e.target.value })}
              placeholder="例）チームの一次対応の品質を引き上げる中心メンバーとして、後輩の手本になってほしい" />
          </label>
          <label className="field">
            <span>なってほしい姿</span>
            <textarea value={form.vision} onChange={(e) => setForm({ ...form, vision: e.target.value })}
              placeholder="例）1年後、パートナー企業との調整を任せられ、自分で判断して動けるリーダー候補" />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setEditing(false)} disabled={busy}>キャンセル</button>
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? '保存しています…' : '保存'}</button>
          </div>
        </>
      ) : row ? (
        <dl className="vision-list">
          <div><dt>期待していること</dt><dd>{row.expectation || <span className="muted">未入力</span>}</dd></div>
          <div><dt>なってほしい姿</dt><dd>{row.vision || <span className="muted">未入力</span>}</dd></div>
        </dl>
      ) : (
        <div className="empty" style={{ padding: '12px 0' }}>
          この半期の期待はまだ書かれていません。目標を決める前に、どんな姿を目指してほしいかを書いておくと、AIレポートの振り返りにも使われます。
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => startEdit(null)}>期待を書く</button>
            <button className="btn" onClick={loadPrev}>前の半期から読み込む</button>
          </div>
        </div>
      )}
    </section>
  )
}
