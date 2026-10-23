// Supabase 接続。URLとキーは .env（ローカル）または Vercel の環境変数から読み込む
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configError = !url || !key
  ? '環境変数 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が設定されていません（README参照）'
  : null

export const supabase = configError ? null : createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
})

// Supabaseのエラーを日本語の短いメッセージにする
export function errMsg(e) {
  if (!e) return '不明なエラー'
  const m = e.message || String(e)
  if (/Failed to fetch|NetworkError/i.test(m)) return '通信できませんでした。電波状況を確認して再度お試しください'
  if (/JWT|expired/i.test(m)) return 'ログインの有効期限が切れました。再ログインしてください'
  if (/Invalid login credentials/i.test(m)) return 'メールアドレスまたはパスワードが違います'
  return m
}
