-- change_username — lets a signed-in player rename themselves.
-- ─────────────────────────────────────────────────────────────────────────
-- Requires the current password as a second factor so a hijacked session
-- alone can't rename the account.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create or replace function public.change_username(
  p_token        text,
  p_new_username text,
  p_password     text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_old       text;
  v_new       text;
  v_hash      text;
begin
  v_new := lower(trim(coalesce(p_new_username, '')));

  if v_new = '' then raise exception 'new username required'; end if;
  if v_new !~ '^[a-z0-9_-]{2,24}$' then
    raise exception 'username must be 2-24 chars (letters, digits, underscore, hyphen)';
  end if;
  if v_new in ('alex', 'admin', 'system', 'mod', 'moderator', 'root', 'support') then
    raise exception 'reserved username';
  end if;

  select p.id, p.username, p.password_hash
    into v_player_id, v_old, v_hash
  from public.player_sessions s
  join public.players p on p.id = s.player_id
  where s.token = p_token
    and (s.expires_at is null or s.expires_at > now())
  limit 1;

  if v_player_id is null then raise exception 'invalid or expired session'; end if;

  if v_hash is null or v_hash <> crypt(coalesce(p_password, ''), v_hash) then
    raise exception 'incorrect password';
  end if;

  -- no-op if the casing changes but normalized name is the same
  if lower(v_old) = v_new then return v_new; end if;

  if exists (select 1 from public.players where lower(username) = v_new and id <> v_player_id) then
    raise exception 'username % already taken', v_new;
  end if;

  update public.players
     set username   = v_new,
         updated_at = now()
   where id = v_player_id;

  return v_new;
end;
$$;

grant execute on function public.change_username(text, text, text) to anon, authenticated;
