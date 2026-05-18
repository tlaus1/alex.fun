-- Group chats for alex.fun messages.
-- ─────────────────────────────────────────────────────────────────────────
-- Adds a group_chats table, group_members join table, and group-aware
-- send/read RPCs. Group messages live in their own table so they don't
-- pollute the existing 1-on-1 `messages` table.
--
-- Assumes:
--   public.players(id uuid pk, username text, ...)
--   public.player_sessions(token text, player_id uuid, expires_at timestamptz)

-- ── Tables ───────────────────────────────────────────────────────────────
create table if not exists public.group_chats (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references public.players(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id   uuid not null references public.group_chats(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (group_id, player_id)
);

create table if not exists public.group_messages (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.group_chats(id) on delete cascade,
  sender_id  uuid not null references public.players(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_message_reads (
  group_id   uuid not null references public.group_chats(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (group_id, player_id)
);

create index if not exists group_messages_group_idx on public.group_messages(group_id, created_at desc);
create index if not exists group_members_player_idx on public.group_members(player_id);

-- ── Token → player helper ────────────────────────────────────────────────
create or replace function public._player_from_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.player_id
    from public.player_sessions s
   where s.token = p_token
     and (s.expires_at is null or s.expires_at > now())
   limit 1;
$$;

-- ── create_group_chat ────────────────────────────────────────────────────
create or replace function public.create_group_chat(
  p_token            text,
  p_name             text,
  p_member_usernames text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid;
  v_group_id  uuid;
  v_member_id uuid;
  v_username  text;
begin
  v_me := public._player_from_token(p_token);
  if v_me is null then raise exception 'invalid or expired session'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'group name required'; end if;
  if p_member_usernames is null or array_length(p_member_usernames, 1) is null then
    raise exception 'at least one member required';
  end if;

  insert into public.group_chats (name, created_by)
       values (trim(p_name), v_me)
    returning id into v_group_id;

  -- Creator is always a member.
  insert into public.group_members (group_id, player_id)
       values (v_group_id, v_me)
  on conflict do nothing;

  foreach v_username in array p_member_usernames loop
    select id into v_member_id from public.players where lower(username) = lower(trim(v_username)) limit 1;
    if v_member_id is not null then
      insert into public.group_members (group_id, player_id)
           values (v_group_id, v_member_id)
      on conflict do nothing;
    end if;
  end loop;

  return v_group_id;
end;
$$;

-- ── list_my_groups ───────────────────────────────────────────────────────
-- Returns the groups the caller is a member of, plus the member usernames
-- and the latest message timestamp + unread count for sorting.
create or replace function public.list_my_groups(p_token text)
returns table (
  group_id       uuid,
  name           text,
  members        text[],
  last_message_at timestamptz,
  unread_count   int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_me uuid;
begin
  v_me := public._player_from_token(p_token);
  if v_me is null then return; end if;

  return query
  with my_groups as (
    select g.id, g.name
      from public.group_chats g
      join public.group_members gm on gm.group_id = g.id
     where gm.player_id = v_me
  ),
  members as (
    select gm.group_id, array_agg(p.username order by p.username) as usernames
      from public.group_members gm
      join public.players p on p.id = gm.player_id
     group by gm.group_id
  ),
  latest as (
    select group_id, max(created_at) as last_at from public.group_messages group by group_id
  ),
  reads as (
    select group_id, read_at from public.group_message_reads where player_id = v_me
  )
  select mg.id, mg.name, coalesce(m.usernames, '{}'),
         l.last_at,
         (
           select count(*)::int
             from public.group_messages gm2
            where gm2.group_id = mg.id
              and gm2.sender_id <> v_me
              and gm2.created_at > coalesce(r.read_at, 'epoch'::timestamptz)
         )
  from my_groups mg
  left join members m on m.group_id = mg.id
  left join latest  l on l.group_id = mg.id
  left join reads   r on r.group_id = mg.id
  order by coalesce(l.last_at, now()) desc;
end;
$$;

-- ── send_group_message ───────────────────────────────────────────────────
create or replace function public.send_group_message(
  p_token    text,
  p_group_id uuid,
  p_body     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid;
begin
  v_me := public._player_from_token(p_token);
  if v_me is null then raise exception 'invalid session'; end if;
  if p_body is null or length(trim(p_body)) = 0 then raise exception 'empty message'; end if;
  if not exists (select 1 from public.group_members where group_id = p_group_id and player_id = v_me) then
    raise exception 'not a member of that group';
  end if;
  insert into public.group_messages (group_id, sender_id, body)
       values (p_group_id, v_me, p_body);
end;
$$;

-- ── list_group_messages ──────────────────────────────────────────────────
create or replace function public.list_group_messages(
  p_token    text,
  p_group_id uuid
)
returns table (
  id         uuid,
  sender     text,
  body       text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_me uuid;
begin
  v_me := public._player_from_token(p_token);
  if v_me is null then return; end if;
  if not exists (select 1 from public.group_members where group_id = p_group_id and player_id = v_me) then
    return;
  end if;
  return query
    select gm.id, p.username, gm.body, gm.created_at
      from public.group_messages gm
      join public.players p on p.id = gm.sender_id
     where gm.group_id = p_group_id
     order by gm.created_at asc
     limit 500;
end;
$$;

-- ── mark_group_read ──────────────────────────────────────────────────────
create or replace function public.mark_group_read(
  p_token    text,
  p_group_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid;
begin
  v_me := public._player_from_token(p_token);
  if v_me is null then return; end if;
  insert into public.group_message_reads (group_id, player_id, read_at)
       values (p_group_id, v_me, now())
  on conflict (group_id, player_id) do update set read_at = excluded.read_at;
end;
$$;

grant execute on function public.create_group_chat(text, text, text[]) to anon, authenticated;
grant execute on function public.list_my_groups(text)                   to anon, authenticated;
grant execute on function public.send_group_message(text, uuid, text)   to anon, authenticated;
grant execute on function public.list_group_messages(text, uuid)        to anon, authenticated;
grant execute on function public.mark_group_read(text, uuid)            to anon, authenticated;
