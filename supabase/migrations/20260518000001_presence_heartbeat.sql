-- True presence — heartbeat-based.
-- ─────────────────────────────────────────────────────────────────────────
-- Adds players.last_seen_at, a heartbeat() RPC the client pings every 30s
-- while the tab is visible, and rewires list_online_usernames() to read
-- "active within the last 60 seconds" instead of "unexpired session."

alter table public.players
  add column if not exists last_seen_at timestamptz;

create index if not exists players_last_seen_at_idx
  on public.players (last_seen_at desc);

-- Client pings this every 30s while the tab is open.
create or replace function public.heartbeat(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_player_id uuid;
begin
  select s.player_id
    into v_player_id
  from public.player_sessions s
  where s.token = p_token
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
  if v_player_id is null then return; end if; -- silent: stale tokens are fine
  update public.players
     set last_seen_at = now()
   where id = v_player_id;
end;
$$;

-- Replace the old "session exists" check with a real activity window.
create or replace function public.list_online_usernames()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select lower(username)
    from public.players
   where last_seen_at is not null
     and last_seen_at > now() - interval '60 seconds';
$$;

grant execute on function public.heartbeat(text)            to anon, authenticated;
grant execute on function public.list_online_usernames()    to anon, authenticated;
