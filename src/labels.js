// 画面とAPIサーバーで共通の表示名（DBには英字のコードで保存し、表示時に日本語へ変換する）
// 面談の種類を増やす場合は、ここと supabase/migrate_003 の check 制約の両方に追加する
export const MEETING_KINDS = [
  ['one_on_one', '1on1'],
  ['goal_setting', '目標設定面談'],
  ['midterm', '中間面談'],
  ['evaluation', '評価面談'],
  ['other', 'その他'],
]
export const meetingKindLabel = (code) => (MEETING_KINDS.find(([c]) => c === code) || [, 'その他'])[1]
