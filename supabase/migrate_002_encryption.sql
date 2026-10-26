-- =============================================================
-- 移行002：暗号化対応＋権限の締め付け
-- 対象 : すべての環境。新規の場合も schema.sql の「後に」続けて実行してください
-- 実行 : Supabase > SQL Editor に全文を貼り付けて Run。何度実行しても問題ありません
-- ★ 新しいプログラムを公開する「前」に実行してください
--   （暗号化すると文字数が増えるため、旧来の文字数制限のままだと登録に失敗します）
-- =============================================================

-- ---------- 1) 文字数制限を暗号文の長さに合わせて見直す ----------
-- 元の文字数チェックは画面・サーバー側（src/cryptoCore.js の LIMITS）で行う
alter table public.members drop constraint if exists members_name_check;
alter table public.members drop constraint if exists members_name_len;
alter table public.members add constraint members_name_len check (char_length(name) between 1 and 1000);

alter table public.members drop constraint if exists members_note_len;
alter table public.members add constraint members_note_len check (note is null or char_length(note) <= 4000);

alter table public.goals drop constraint if exists goals_title_check;
alter table public.goals drop constraint if exists goals_title_len;
alter table public.goals add constraint goals_title_len check (char_length(title) between 1 and 2000);

alter table public.goals drop constraint if exists goals_description_len;
alter table public.goals add constraint goals_description_len check (description is null or char_length(description) <= 12000);

alter table public.points drop constraint if exists points_content_check;
alter table public.points drop constraint if exists points_content_len;
alter table public.points add constraint points_content_len check (char_length(content) between 1 and 12000);

alter table public.reports drop constraint if exists reports_summary_len;
alter table public.reports add constraint reports_summary_len check (char_length(summary) <= 300000);

-- ---------- 2) 未ログイン（anon）ロールからテーブル権限を外す ----------
-- RLSで既に守られているが、二重の鍵として「未ログインでは触れない」をDBの権限でも保証する
revoke all on public.members, public.goals, public.points, public.reports from anon;
grant select, insert, update, delete on public.members, public.goals, public.points, public.reports to authenticated;

-- 今後このスキーマに作るテーブルも、既定で anon に権限を与えない
alter default privileges in schema public revoke all on tables from anon;

-- ---------- 3) 他人のデータを参照する目標IDを登録できないようにする ----------
-- （points.goal_id / goals.member_id が自分のデータであることをRLSで確認）
drop policy if exists "owner_all" on public.points;
create policy "owner_all" on public.points for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.members m where m.id = member_id and m.owner_id = auth.uid())
    and (goal_id is null or exists (select 1 from public.goals g where g.id = goal_id and g.owner_id = auth.uid()))
  );

drop policy if exists "owner_all" on public.goals;
create policy "owner_all" on public.goals for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.members m where m.id = member_id and m.owner_id = auth.uid()));

drop policy if exists "owner_all" on public.reports;
create policy "owner_all" on public.reports for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.members m where m.id = member_id and m.owner_id = auth.uid()));

-- 確認用：下の結果で anon の行が出なければOK
-- select grantee, table_name, privilege_type from information_schema.role_table_grants
--  where table_schema = 'public' and grantee = 'anon';
