// 画面側の暗号化処理：鍵の取得・端末内保管、保存前の暗号化、表示前の復号、既存データの移行
//
// 鍵の流れ:
//   1) ログイン後、APIサーバー(Render)から鍵を受け取る（その端末で初回のみ。最大1分ほど）
//   2) 「取り出し不可」の鍵としてブラウザ内(IndexedDB)に保管 → 2回目以降はサーバー不要ですぐ使える
//   3) 手動ログアウトで端末から削除
import { supabase } from './supabase'
import { FIELDS, importKey, b64ToBytes, encryptRow, decryptRows } from './cryptoCore'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const DB_NAME = 'goodbad-keys'
const STORE = 'keys'

let keyPromise = null
let keyUser = null
let keyCache = null

// ---------- IndexedDB（使えない環境ではメモリ上だけで動く） ----------
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => { db.close(); resolve(req?.result) }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
  })
}

async function fetchKeyFromApi() {
  if (!API_URL) throw new Error('環境変数 VITE_API_URL が設定されていません（README参照）')
  const { data: s } = await supabase.auth.getSession()
  if (!s.session) throw new Error('ログインの有効期限が切れました。再ログインしてください')
  let res
  try {
    res = await fetch(`${API_URL}/api/data-key`, {
      headers: { Authorization: `Bearer ${s.session.access_token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000), // Render無料プランのスリープ復帰を見込む
    })
  } catch (e) {
    throw new Error(e.name === 'TimeoutError'
      ? 'サーバーの起動に時間がかかっています。少し待って「再試行」を押してください'
      : 'サーバーに接続できませんでした。電波状況を確認して「再試行」を押してください')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `鍵を取得できませんでした（${res.status}）`)
  const raw = b64ToBytes(body.key)
  const key = await importKey(raw, false) // 取り出し不可
  raw.fill(0) // 元のバイト列はすぐ消す
  return key
}

async function loadKey(userId) {
  try {
    const stored = await idb('readonly', (st) => st.get(userId))
    if (stored) return stored
  } catch { /* IndexedDBが使えない（プライベートモード等）→ サーバーから取得 */ }
  const key = await fetchKeyFromApi()
  try { await idb('readwrite', (st) => st.put(key, userId)) } catch { /* 保存できなくても今回は使える */ }
  return key
}

// ログインユーザーの鍵を準備する（同時に何度呼ばれても取得は1回）
export function ensureKey(userId) {
  if (keyUser !== userId || !keyPromise) {
    keyUser = userId
    keyCache = null
    keyPromise = loadKey(userId)
      .then((k) => { keyCache = k; return k })
      .catch((e) => { keyPromise = null; keyUser = null; throw e })
  }
  return keyPromise
}

function currentKey() {
  if (!keyCache) throw new Error('暗号鍵の準備ができていません。画面を再読み込みしてください')
  return keyCache
}

// 手動ログアウト時：端末から鍵を消す
export async function clearKey() {
  keyPromise = null; keyUser = null; keyCache = null
  try { await idb('readwrite', (st) => st.clear()) } catch { /* 消せなくても致命的ではない */ }
}

// ---------- 保存前・表示前の変換 ----------
export const encRow = (table, row) => encryptRow(currentKey(), table, row)
export const decRows = (table, rows) => decryptRows(currentKey(), table, rows)
export const decRow = async (table, row) => (row ? (await decRows(table, [row]))[0] : row)

// ---------- 暗号化前に保存されたデータ（平文）を暗号化し直す ----------
// ログインのたびに裏で実行。平文が残っていなければ何もしない
export async function migratePlaintext() {
  let count = 0
  for (const [table, fields] of Object.entries(FIELDS)) {
    for (const field of fields) {
      const { data, error } = await supabase.from(table).select(`id,${field}`).not(field, 'like', 'enc:v1:%').limit(500)
      if (error) throw error
      for (const row of data) {
        if (row[field] === null || row[field] === '') continue
        const e = await encRow(table, { [field]: row[field] })
        const { error: uErr } = await supabase.from(table).update(e).eq('id', row.id)
        if (uErr) throw uErr
        count++
      }
    }
  }
  return count
}
