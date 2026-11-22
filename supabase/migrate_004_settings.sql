-- =============================================================
-- 移行004：利用者ごとの設定（年度の開始月）を追加
-- 実行 : Supabase > SQL Editor に全文を貼り付けて Run。何度実行しても問題ありません
-- ★ 新しいプログラムを公開する「前」に実行してください
--   （実行しなくても画面は動きます。その場合は年度の開始月が4月のまま固定になります）
-- =============================================================

-- ---------- 利用者の設定（1人1行） ----------
-- fiscal_start_month：年度の開始月（1〜12）。半期はここから6か月ずつ
--   4 … 上期 4〜9月 / 下期 10〜翌3月（初期値）
--   1 … 上期 1〜6月 / 下期 7〜12月
-- 秘密情報ではないため暗号化はしない
create table if not exists public.user_settings (
  owner_id           uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  fiscal_start_month int not null default 4 check (fiscal_start_month between 1 and 12),
  updated_at         timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "owner_all" on public.user_settings;
create policy "owner_all" on public.user_settings for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 未ログイン（anon）では触れない（移行002と同じ考え方）
revoke all on public.user_settings from anon;
grant select, insert, update on public.user_settings to authenticated;
