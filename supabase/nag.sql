-- 定点催促提醒（轻盈日记 diet / 记账·事项 ledger 共用）。幂等。
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.nag_subs (
  id uuid primary key default gen_random_uuid(),
  app text not null check (app in ('diet','ledger')),
  token_hash text not null,
  endpoint text not null check (length(endpoint)<1000),
  p256dh text not null check (length(p256dh)<200),
  auth text not null check (length(auth)<100),
  tz text not null default 'Asia/Tokyo' check (length(tz)<64),
  enabled boolean not null default true,
  slots jsonb not null default '{"m":{"on":true,"t":"08:30"},"n":{"on":true,"t":"12:30"},"e":{"on":true,"t":"19:30"}}'::jsonb check (pg_column_size(slots)<600),
  last_sent jsonb not null default '{}'::jsonb,
  last_act timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app, token_hash)
);
create unique index if not exists nag_subs_app_endpoint on public.nag_subs(app, endpoint);
alter table public.nag_subs enable row level security;
revoke all on public.nag_subs from anon, authenticated;
-- 只能凭设备随机令牌（服务器只存哈希）管理自己的那一行
create or replace function public.nag_h(p text) returns text language sql immutable as $$ select encode(extensions.digest(p,'sha256'),'hex') $$;
create or replace function public.nag_upsert(p_token text,p_app text,p_endpoint text,p_p256dh text,p_auth text,p_tz text,p_enabled boolean,p_slots jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if length(p_token)<32 or p_endpoint !~ '^https://' or pg_timezone_names_ok(p_tz) is not true then raise exception 'bad input'; end if;
  delete from nag_subs where app=p_app and endpoint=p_endpoint and token_hash<>nag_h(p_token);
  insert into nag_subs(app,token_hash,endpoint,p256dh,auth,tz,enabled,slots)
  values(p_app,nag_h(p_token),p_endpoint,p_p256dh,p_auth,p_tz,p_enabled,p_slots)
  on conflict (app,token_hash) do update set endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth,tz=excluded.tz,enabled=excluded.enabled,slots=excluded.slots,updated_at=now();
  return true; end $$;
create or replace function public.pg_timezone_names_ok(p text) returns boolean language sql stable as $$ select exists(select 1 from pg_timezone_names where name=p) $$;
create or replace function public.nag_set(p_token text,p_app text,p_enabled boolean,p_slots jsonb) returns boolean language sql security definer set search_path=public as $$
  update nag_subs set enabled=p_enabled,slots=coalesce(p_slots,slots),updated_at=now() where app=p_app and token_hash=nag_h(p_token) returning true $$;
create or replace function public.nag_touch(p_token text,p_app text) returns void language sql security definer set search_path=public as $$
  update nag_subs set last_act=now() where app=p_app and token_hash=nag_h(p_token) $$;
create or replace function public.nag_delete(p_token text,p_app text) returns void language sql security definer set search_path=public as $$
  delete from nag_subs where app=p_app and token_hash=nag_h(p_token) $$;
revoke all on function public.nag_upsert(text,text,text,text,text,text,boolean,jsonb),public.nag_set(text,text,boolean,jsonb),public.nag_touch(text,text),public.nag_delete(text,text) from public;
grant execute on function public.nag_upsert(text,text,text,text,text,text,boolean,jsonb),public.nag_set(text,text,boolean,jsonb),public.nag_touch(text,text),public.nag_delete(text,text) to anon, authenticated;
-- 定时任务（每 5 分钟）：把 <CRON_SECRET> 换成 Edge Function secret NAG_CRON_SECRET 的值
-- create extension if not exists pg_cron; create extension if not exists pg_net;
-- select cron.schedule('nag-push','*/5 * * * *',$$select net.http_post(url:='https://wtkvkklhbjoiitfvkkne.supabase.co/functions/v1/nag-push',headers:=jsonb_build_object('content-type','application/json','x-cron-secret','<CRON_SECRET>'),body:='{}'::jsonb,timeout_milliseconds:=30000)$$);
