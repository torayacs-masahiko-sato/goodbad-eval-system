-- =============================================================
-- 移行003：「期待・なってほしい姿」と「面談記録」を追加
-- 実行 : Supabase > SQL Editor に全文を貼り付けて Run。何度実行しても問題ありません
-- ★ 新しいプログラムを公開する「前」に実行してください
-- 文章の列（expectation / vision / content / next_actions）は画面側で暗号化して保存します
-- 文字数制限は暗号文の長さ（元の約4倍）で設定。元の文字数は src/cryptoCore.js の LIMITS で確認
-- =============================================================

-- ---------- 期待していること・なってほしい姿（メンバー×半期で1件） ----------
-- 半期ごとに持つ理由：期待は成長に合わせて変わるため。過去の期待も振り返れるように残す
create table if not exists public.expectations (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  period_key  text not null check (period_key ~ '^\d{4}H[12]$'),
  expectation text check (expectation is null or char_length(expectation) <= 16000), -- 期待していること
  vision      text check (vision is null or char_length(vision) <= 16000),           -- なってほしい姿
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, member_id, period_key)
);

-- ---------- 面談記録 ----------
create table if not exists public.meetings (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  met_on       date not null default (now() at time zone 'Asia/Tokyo')::date,
  kind         text not null default 'one_on_one'
               check (kind in ('one_on_one', 'goal_setting', 'midterm', 'evaluation', 'other')),
  content      text not null check (char_length(content) between 1 and 40000),      -- 話した内容
  next_actions text check (next_actions is null or char_length(next_actions) <= 16000), -- 次回までに
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists meetings_member_date_idx on public.meetings (member_id, met_on desc);

-- 更新日時の自動更新（schema.sql で作成済みの関数を利用）
drop trigger if exists expectations_touch on public.expectations;
create trigger expectations_touch before update on public.expectations
  for each row execute function public.touch_updated_at();
drop trigger if exists meetings_touch on public.meetings;
create trigger meetings_touch before update on public.meetings
  for each row execute function public.touch_updated_at();

-- ---------- アクセス制御（自分のデータ・自分のメンバーだけ） ----------
alter table public.expectations enable row level security;
alter table public.meetings     enable row level security;

drop policy if exists "owner_all" on public.expectations;
create policy "owner_all" on public.expectations for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.members m where m.id = member_id and m.owner_id = auth.uid()));

drop policy if exists "owner_all" on public.meetings;
create policy "owner_all" on public.meetings for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.members m where m.id = member_id and m.owner_id = auth.uid()));

revoke all on public.expectations, public.meetings from anon;
grant select, insert, update, delete on public.expectations, public.meetings to authenticated;
