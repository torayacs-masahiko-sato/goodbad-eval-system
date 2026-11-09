// 面談記録：メンバーごとに 1on1・目標設定・中間・評価面談などの内容と「次回までに」を残す
// 面談の冒頭で前回の「次回までに」を確認できるよう、入力欄の上に表示する
import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../supabase'
import { MemberPicker, Pager } from '../components'
import { currentHalfKey, shiftHalf, halfShortLabel, halfRange, todayStr, dayLabel } from '../period'
import { encRow, decRows } from '../crypto'
import { MEETING_KINDS, meetingKindLabel } from '../labels'

// 一覧では年を省略（半期で絞り込んでいるため年は明らか。狭い画面で操作ボタンが折り返さないように）
const shortDay = (ds) => dayLabel(ds).slice(5).replace(/^0/, '').replace('/0', '/')

const blank = () => ({ met_on: todayStr(), kind: 'one_on_one', content: '', next_actions: '' })

export default function Meetings({ members, memberId, setMemberId, notify }) {
  const [half, setHalf] = useState(currentHalfKey())
  const [list, setList] = useState([])
  const [latest, setLatest] = useState(null) // 期間に関係なく直近の面談（前回の「次回までに」用）
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(blank())
  const [editId, setEditId] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    if (!memberId) return
    setLoading(true)
    const [from, to] = halfRange(half)
    const [r1, r2] = await Promise.all([
      supabase.from('meetings').select('*').eq('member_id', memberId)
        .gte('met_on', from).lt('met_on', to).order('met_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('meetings').select('*').eq('member_id', memberId)
        .order('met_on', { ascending: false }).order('created_at', { ascending: false }).limit(1),
    ])
    if (r1.error || r2.error) { setLoading(false); return notify(errMsg(r1.error || r2.error), 'error') }
    const [rows, last] = await Promise.all([decRows('meetings', r1.data), decRows('meetings', r2.data)])
    setList(rows); setLatest(last[0] || null); setLoading(false)
  }
  useEffect(() => { load(); setEditId(null); setForm(blank()) }, [memberId, half]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!form.content.trim()) return notify('面談の内容を入力してください', 'error')
    if (!form.met_on) return notify('面談日を入力してください', 'error')
    setBusy(true)
    try {
      const row = await encRow('meetings', {
        met_on: form.met_on, kind: form.kind, content: form.content.trim(), next_actions: form.next_actions.trim() || null,
      })
      const { error } = editId
        ? await supabase.from('meetings').update(row).eq('id', editId)
        : await supabase.from('meetings').insert({ ...row, member_id: memberId })
      if (error) throw error
      notify(editId ? '面談記録を更新しました' : '面談記録を保存しました')
      setForm(blank()); setEditId(null)
      // 保存した日付の半期へ移動して、保存結果が見えるようにする
      const y = +form.met_on.slice(0, 4), m = +form.met_on.slice(5, 7)
      const savedHalf = m >= 4 && m <= 9 ? `${y}H1` : m >= 10 ? `${y}H2` : `${y - 1}H2`
      if (savedHalf !== half) setHalf(savedHalf); else load()
    } catch (e) {
      notify(errMsg(e), 'error') // 入力内容は残す
    } finally { setBusy(false) }
  }

  const startEdit = (mt) => {
    setEditId(mt.id)
    setForm({ met_on: mt.met_on, kind: mt.kind, content: mt.content || '', next_actions: mt.next_actions || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const remove = async (mt) => {
    if (!window.confirm(`${dayLabel(mt.met_on)}の面談記録を削除します。元に戻せません。よろしいですか？`)) return
    const { error } = await supabase.from('meetings').delete().eq('id', mt.id)
    if (error) return notify(errMsg(error), 'error')
    notify('面談記録を削除しました')
    if (editId === mt.id) { setEditId(null); setForm(blank()) }
    load()
  }

  const who = members.find((m) => m.id === memberId)?.name ?? ''
  const carry = !editId && latest?.next_actions ? latest : null

  return (
    <>
      <section className="page-head">
        <MemberPicker members={members} memberId={memberId} setMemberId={setMemberId} />
        <h1 className="page-title">{who}さんとの面談</h1>
      </section>

      <section className="sheet stack" aria-label={editId ? '面談記録を編集' : '面談を記録'}>
        <h2 className="sheet-title" style={{ margin: 0 }}>{editId ? '面談記録を編集' : '面談を記録'}</h2>

        {carry && (
          <div className="meeting-next carry">
            <b>前回 {dayLabel(carry.met_on)} の「次回までに」</b>
            <p>{carry.next_actions}</p>
          </div>
        )}

        <div className="two">
          <label className="field">
            <span>面談日</span>
            <input type="date" value={form.met_on} max={todayStr()} onChange={(e) => setForm({ ...form, met_on: e.target.value })} />
          </label>
          <label className="field">
            <span>種類</span>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {MEETING_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>話した内容</span>
          <textarea className="ruled" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="例）一次回答の時間短縮について。本人は手順書の検索に時間がかかっていると感じている。よく使う手順をまとめたメモを作ることで合意" />
        </label>
        <label className="field">
          <span>次回までに</span>
          <textarea value={form.next_actions} onChange={(e) => setForm({ ...form, next_actions: e.target.value })}
            placeholder="例）本人：よく使う手順を5つメモにまとめる／自分：手順書の改善要望をパートナーに伝える" />
        </label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {editId && <button className="btn" onClick={() => { setEditId(null); setForm(blank()) }} disabled={busy}>キャンセル</button>}
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? '保存しています…' : editId ? '変更を保存' : '面談記録を保存'}</button>
        </div>
      </section>

      <section className="sheet flush" aria-label="面談の履歴">
        <div style={{ padding: '12px 0 4px' }}>
          <Pager title={halfShortLabel(half)} onPrev={() => setHalf(shiftHalf(half, -1))} onNext={() => setHalf(shiftHalf(half, 1))} nextDisabled={half >= currentHalfKey()} />
        </div>
        {loading ? <div className="empty">読み込んでいます…</div>
          : list.length === 0 ? <div className="empty">この半期の面談記録はありません</div>
          : list.map((mt) => (
            <article className="meeting" key={mt.id}>
              <div className="meeting-head">
                <span className="meeting-date num">{shortDay(mt.met_on)}</span>
                <span className="meeting-kind">{meetingKindLabel(mt.kind)}</span>
                <span className="note-actions">
                  <button className="link" onClick={() => startEdit(mt)}>編集</button>
                  <button className="link danger" onClick={() => remove(mt)}>削除</button>
                </span>
              </div>
              <div className="meeting-body">{mt.content}</div>
              {mt.next_actions && (
                <div className="meeting-next"><b>次回までに</b><p>{mt.next_actions}</p></div>
              )}
            </article>
          ))}
      </section>
    </>
  )
}
