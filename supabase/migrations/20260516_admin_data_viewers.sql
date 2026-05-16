-- Admin data viewers (alex.fun)
-- ─────────────────────────────────────────────────────────────────────────
-- Read-only RPCs that let Alex pull data from the existing tables for the
-- admin panel "Data Viewer" section. Each row is returned as JSONB, so we
-- don't have to hard-code column names — whatever's in the table comes back.
--
-- If a table doesn't exist on your project (e.g. `ban_appeals` is named
-- something else), the matching function will error out cleanly and the
-- client shows the message. Edit the `from` clauses below to match.
-- ─────────────────────────────────────────────────────────────────────────

-- Helper: token + alex-only check, returns the resolved username.
create or replace function public._require_alex(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_caller text;
begin
  select s.username
    into v_caller
  from public.sessions s
  where s.token = p_token
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
  if v_caller is null then raise exception 'invalid or expired session'; end if;
  if lower(v_caller) <> 'alex' then raise exception 'only alex can view admin data'; end if;
end;
$$;

-- 1. All players
create or replace function public.admin_list_players(p_token uuid)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_alex(p_token);
  return query
    select to_jsonb(p) - 'password_hash' - 'password'
      from public.players p
      order by p.username;
end;
$$;

-- 2. Suggestions, newest first
create or replace function public.admin_list_suggestions(p_token uuid)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_alex(p_token);
  return query
    select to_jsonb(s)
      from public.suggestions s
      order by s.created_at desc nulls last
      limit 200;
end;
$$;

-- 3. Ban appeals, newest first
create or replace function public.admin_list_appeals(p_token uuid)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_alex(p_token);
  return query
    select to_jsonb(a)
      from public.ban_appeals a
      order by a.created_at desc nulls last
      limit 200;
end;
$$;

-- 4. Active sessions (not expired). Strips the actual token so an over-the-
-- shoulder peek at Alex's screen can't hijack anyone else's account.
create or replace function public.admin_list_sessions(p_token uuid)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_alex(p_token);
  return query
    select to_jsonb(s) - 'token'
      from public.sessions s
      where s.expires_at is null or s.expires_at > now()
      order by coalesce(s.created_at, s.expires_at) desc nulls last
      limit 200;
end;
$$;

grant execute on function public.admin_list_players(uuid)     to anon, authenticated;
grant execute on function public.admin_list_suggestions(uuid) to anon, authenticated;
grant execute on function public.admin_list_appeals(uuid)     to anon, authenticated;
grant execute on function public.admin_list_sessions(uuid)    to anon, authenticated;
