-- Per-game access controls (alex.fun)
-- ─────────────────────────────────────────────────────────────────────────
-- Lets Alex lock games and maintain an allow-list of usernames per game.
-- Reads are public (so every dashboard can hide locked cards correctly).
-- Writes go through a SECURITY DEFINER RPC that validates the caller's
-- session token and that the resolved username is "alex".
--
-- Paste this entire file into the Supabase Dashboard → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Table
create table if not exists public.game_perms (
  game_id       text primary key,
  locked        boolean      not null default false,
  allowed_users text[]       not null default '{}',
  updated_at    timestamptz  not null default now()
);

-- 2. Anyone (incl. anon) may read the perms — that's the whole point;
--    the dashboard needs to know which cards to hide for each visitor.
alter table public.game_perms enable row level security;

drop policy if exists "game_perms read"  on public.game_perms;
drop policy if exists "game_perms write" on public.game_perms;

create policy "game_perms read"
  on public.game_perms
  for select
  using (true);

-- No INSERT/UPDATE/DELETE policy — all writes must go through the RPC.

-- 3. Read RPC — convenient single-call fetch. (Direct table select works
--    too because of the RLS policy above, but having an RPC keeps the
--    client code symmetrical with set_game_perm.)
create or replace function public.list_game_perms()
returns table (
  game_id       text,
  locked        boolean,
  allowed_users text[]
)
language sql
stable
as $$
  select game_id, locked, allowed_users
  from public.game_perms;
$$;

-- 4. Write RPC — validates session token and that the caller is "alex".
-- Adjust the sessions-lookup inside if your sessions table uses different
-- column names (this matches the pattern used by save_clicker / submit_suggestion).
create or replace function public.set_game_perm(
  p_token     text,
  p_game_id   text,
  p_locked    boolean,
  p_allowed   text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  if p_game_id is null or length(trim(p_game_id)) = 0 then
    raise exception 'game_id required';
  end if;

  -- Resolve token → username. Adjust columns here if your sessions table
  -- differs from { token uuid, username text, expires_at timestamptz }.
  select s.username
    into v_username
  from public.player_sessions s
  where s.token = p_token
    and (s.expires_at is null or s.expires_at > now())
  limit 1;

  if v_username is null then
    raise exception 'invalid or expired session';
  end if;

  if lower(v_username) <> 'alex' then
    raise exception 'only alex can modify game perms';
  end if;

  insert into public.game_perms (game_id, locked, allowed_users, updated_at)
  values (
    trim(p_game_id),
    coalesce(p_locked, false),
    coalesce(p_allowed, '{}'::text[]),
    now()
  )
  on conflict (game_id) do update
    set locked        = excluded.locked,
        allowed_users = excluded.allowed_users,
        updated_at    = now();
end;
$$;

-- 5. Permissions: allow anon + authenticated to call both functions.
grant execute on function public.list_game_perms()                                       to anon, authenticated;
grant execute on function public.set_game_perm(text, text, boolean, text[])              to anon, authenticated;
