// パスキー（指紋・顔認証・PINでのログイン）関連の共通処理
// Supabase Auth のパスキー機能（ベータ版, supabase-js 2.105.0 以降）を使用
import { supabase } from './supabase'

// このブラウザがパスキーに対応しているか
export const passkeySupported = () =>
  typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials

// パスキー操作のエラーを日本語にする。キャンセルは null（エラー表示しない）
export function passkeyErrMsg(e) {
  if (!e) return '不明なエラー'
  const code = e.code || e.error_code || ''
  const name = e.cause?.name || e.name || ''
  const msg = e.message || String(e)
  if (code === 'ERROR_CEREMONY_ABORTED' || name === 'NotAllowedError' || name === 'AbortError') return null
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || name === 'InvalidStateError') return 'このデバイスのパスキーは登録済みです'
  if (code === 'ERROR_INVALID_DOMAIN' || code === 'ERROR_INVALID_RP_ID' || name === 'SecurityError')
    return 'パスキーの設定とURLが一致しません（SupabaseのRelying Party ID / Origins を確認してください）'
  if (/passkey.*(disabled|not enabled)|feature.*disabled/i.test(msg) || code === 'passkey_disabled')
    return 'Supabaseでパスキーが有効になっていません（README参照）'
  if (code === 'webauthn_challenge_expired') return '時間切れになりました。もう一度お試しください'
  if (/credential.*not found|no.*passkey|unknown credential/i.test(msg)) return 'このパスキーは登録されていません。パスワードでログインして登録し直してください'
  if (code === 'email_not_confirmed') return 'メールアドレスが未確認のアカウントです'
  if (code === 'user_banned') return 'このアカウントは利用停止されています'
  if (/Failed to fetch|NetworkError/i.test(msg)) return '通信できませんでした。電波状況を確認して再度お試しください'
  return msg
}

export async function signInWithPasskey() {
  const { error } = await supabase.auth.signInWithPasskey()
  if (error) throw error
}

export async function registerPasskey() {
  const { data, error } = await supabase.auth.registerPasskey()
  if (error) throw error
  return data
}

export async function listPasskeys() {
  const { data, error } = await supabase.auth.passkey.list()
  if (error) throw error
  return data ?? []
}

export async function renamePasskey(passkeyId, friendlyName) {
  const { error } = await supabase.auth.passkey.update({ passkeyId, friendlyName })
  if (error) throw error
}

export async function deletePasskey(passkeyId) {
  const { error } = await supabase.auth.passkey.delete({ passkeyId })
  if (error) throw error
}
