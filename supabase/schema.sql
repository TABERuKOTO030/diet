-- 轻盈日记 · 减脂卡路里 app 数据表（只新增 diet_ 前缀的表，不改动已有的 profiles 表和 avatars 存储桶）
-- 可重复运行（幂等）。所有数据仅本人可读写（RLS）。

create table if not exists public.diet_profiles (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 20000),
  updated_at timestamptz not null default now()
);

create table if not exists public.diet_logs (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  kind       text not null check (kind in ('food','exercise','water')),
  meal       text not null default '' check (meal in ('','breakfast','lunch','dinner','snack')),
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 4000),
  deleted    boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists diet_logs_user_day on public.diet_logs (user_id, day);
create index if not exists diet_logs_user_updated on public.diet_logs (user_id, updated_at);

create table if not exists public.diet_weights (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  weight     numeric(5,2) check (weight is null or weight between 20 and 400),
  waist      numeric(5,1) check (waist is null or waist between 30 and 250),
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.diet_custom_foods (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 2000),
  deleted    boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists diet_custom_foods_user on public.diet_custom_foods (user_id);

-- 行级安全：仅本人
do $$
declare t text;
begin
  foreach t in array array['diet_profiles','diet_logs','diet_weights','diet_custom_foods'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s owner select" on public.%I', t, t);
    execute format('drop policy if exists "%s owner insert" on public.%I', t, t);
    execute format('drop policy if exists "%s owner update" on public.%I', t, t);
    execute format('drop policy if exists "%s owner delete" on public.%I', t, t);
    execute format('create policy "%s owner select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s owner insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s owner update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s owner delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
