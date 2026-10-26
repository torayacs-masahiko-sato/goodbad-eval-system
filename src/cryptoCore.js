// =============================================================
// 暗号化の中核処理（ブラウザと API サーバーで同じファイルを共用）
//
// 方式 : AES-256-GCM（改ざん検知付きの標準的な暗号方式）
// 保存形式 : 'enc:v1:' + Base64( IV(12バイト) + 暗号文 + 認証タグ(16バイト) )
// 鍵 : Render の環境変数 ENCRYPTION_KEY を SHA-256 で 32バイトにしたもの
//      → 鍵は Supabase に置かないので、DBが丸ごと漏れても中身は読めない
// 追加認証データ(AAD) : 'goodbad:v1:テーブル.列' … 暗号文を別の列へ移し替える改ざんを検知
//
// 共用にした理由 : 画面とサーバーで実装がずれると「片方で暗号化したものを
//                  もう片方で復号できない」事故になるため
// =============================================================

export const PREFIX = 'enc:v1:'

// 暗号化する列（Good/Bad の種別・日時・ID などの検索や集計に使う列は対象外）
export const FIELDS = {
  members: ['name', 'note'],
  goals: ['title', 'description'],
  points: ['content'],
  reports: ['summary'],
}

// 暗号化前の文字数上限（DB側の制限は暗号文の長さになるため、ここで元の文字数を確認する）
export const LIMITS = {
  'members.name': 50,
  'members.note': 500,
  'goals.title': 200,
  'goals.description': 2000,
  'points.content': 2000,
  'reports.summary': 50000,
}
const LABELS = { 'members.name': '氏名', 'members.note': 'メモ', 'goals.title': '目標タイトル', 'goals.description': '目標の詳細', 'points.content': '内容' }

export const UNREADABLE = '［復号できません：暗号鍵が違う可能性があります］'

const subtle = () => globalThis.crypto.subtle
const enc = new TextEncoder()
const dec = new TextDecoder()

export function bytesToB64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
export function b64ToBytes(b64) {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

// 環境変数の文字列から 32バイトの鍵素材を作る
export async function deriveKeyBytes(secret) {
  if (!secret || secret.length < 32) throw new Error('ENCRYPTION_KEY は32文字以上のランダムな文字列にしてください')
  return new Uint8Array(await subtle().digest('SHA-256', enc.encode(secret)))
}

// extractable=false：取り出し不可の鍵にする（ブラウザ内で悪意あるスクリプトが動いても鍵そのものは持ち出せない）
export function importKey(rawBytes, extractable = false) {
  return subtle().importKey('raw', rawBytes, { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt'])
}

const aad = (table, field) => enc.encode(`goodbad:v1:${table}.${field}`)

export async function encryptText(key, table, field, text) {
  if (text === null || text === undefined || text === '') return text
  if (typeof text === 'string' && text.startsWith(PREFIX)) return text // 二重暗号化しない
  const s = String(text)
  const limit = LIMITS[`${table}.${field}`]
  if (limit && [...s].length > limit) throw new Error(`${LABELS[`${table}.${field}`] || field}は${limit}文字以内で入力してください`)
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(table, field) }, key, enc.encode(s)))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv); out.set(ct, iv.length)
  return PREFIX + bytesToB64(out)
}

// 暗号化前に保存された古いデータ（平文）はそのまま返す
export async function decryptText(key, table, field, value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value
  try {
    const buf = b64ToBytes(value.slice(PREFIX.length))
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: buf.subarray(0, 12), additionalData: aad(table, field) }, key, buf.subarray(12))
    return dec.decode(pt)
  } catch {
    return UNREADABLE // 鍵違い・改ざん。画面全体を止めないよう、その項目だけ置き換える
  }
}

export async function encryptRow(key, table, row) {
  const out = { ...row }
  for (const f of FIELDS[table] || []) {
    if (f in out && out[f] !== null && out[f] !== undefined) out[f] = await encryptText(key, table, f, out[f])
  }
  return out
}

export async function decryptRows(key, table, rows) {
  const fields = FIELDS[table] || []
  return Promise.all((rows || []).map(async (r) => {
    const out = { ...r }
    for (const f of fields) if (f in out) out[f] = await decryptText(key, table, f, out[f])
    return out
  }))
}
