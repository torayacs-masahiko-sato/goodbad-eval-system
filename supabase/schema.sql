-- =============================================================
-- メンバー評価ポイント管理システム  DB定義
-- 実行方法: Supabase ダッシュボード > SQL Editor に全文を貼り付けて Run
-- 何度実行しても壊れないよう「if not exists」で書いています
-- =============================================================

-- ---------- メンバー ----------
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 50),
  note        text,
  active      boolean not null default true,   -- 異動・退職時は false にして非表示（データは残す）
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- 半期目標 ----------
-- period_key の形式: '2026H1' = 2026年度上期(2026/4〜9), '2026H2' = 2026年度下期(2026/10〜2027/3)
create table if not exists public.goals (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  period_key  text not null check (period_key ~ '^\d{4}H[12]$'),
  title       text not null check (char_length(title) between 1 and 200),
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists goals_member_period_idx on public.goals (member_id, period_key);

-- ---------- 評価ポイント（Good / Bad） ----------
create table if not exists public.points (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  goal_id     uuid references public.goals(id) on delete set null,  -- 目標を消しても記録は残る
  kind        text not null check (kind in ('good', 'bad')),
  content     text not null check (char_length(content) between 1 and 2000),
  occurred_at timestamptz not null default now(),  -- 出来事の日時（後から別日で登録も可）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists points_member_time_idx on public.points (member_id, occurred_at);

-- ---------- AIレポート ----------
-- report_type: 'monthly'（period_key='2026-10'） / 'half'（period_key='2026H2'）
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  report_type  text not null check (report_type in ('monthly', 'half')),
  period_key   text not null,
  summary      text not null,
  source_count int not null default 0,   -- 要約に使った記録件数
  model        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (owner_id, member_id, report_type, period_key)   -- 再作成時は上書き
);

-- ---------- 更新日時の自動更新 ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists points_touch on public.points;
create trigger points_touch before update on public.points
  for each row execute function public.touch_updated_at();

drop trigger if exists reports_touch on public.reports;
create trigger reports_touch before update on public.reports
  for each row execute function public.touch_updated_at();

-- =============================================================
-- 行レベルセキュリティ（RLS）
-- 「ログインした本人が登録したデータだけ」読み書きできるようにする。
-- 画面のURLやキーが漏れても、ログインしなければ一切見えない。
-- =============================================================
alter table public.members enable row level security;
alter table public.goals   enable row level security;
alter table public.points  enable row level security;
alter table public.reports enable row level security;

do $$
declare t text;
begin
  foreach t in array array['members', 'goals', 'points', 'reports'] loop
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated
         using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;
