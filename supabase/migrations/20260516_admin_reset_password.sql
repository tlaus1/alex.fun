-- Admin password reset (alex.fun)
-- ─────────────────────────────────────────────────────────────────────────
-- Lets Alex reset another user's password from the admin panel.
-- Validates the caller's session token belongs to "alex" and re-hashes the
-- new password using the same scheme login_player / register_player use.
--
-- Paste this whole file into Supabase Dashboard → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────────────

-- pgcrypto is what crypt()/gen_salt() come from. Safe to run repeatedly.
create extension if not exists pgcrypto;

create or replace function public.admin_reset_password(
  p_token            text,
  p_target_username  text,
  p_new_password     text,
  p_reason           text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller text;
  v_target text;
begin
  if p_new_password is null or length(p_new_password) < 4 then
    raise exception 'password must be at least 4 characters';
  end if;

  -- Resolve caller's session token → username via player_sessions ↔ players.
  select p.username
    into v_caller
  from public.player_sessions s
  join public.players p on p.id = s.player_id
  where s.token = p_token
    and (s.expires_at is null or s.expires_at > now())
  limit 1;

  if v_caller is null then
    raise exception 'invalid or expired session';
  end if;

  if lower(v_caller) <> 'alex' then
    raise exception 'only alex can reset passwords';
  end if;

  v_target := lower(trim(p_target_username));
  if v_target = '' or v_target is null then
    raise exception 'target username required';
  end if;
  if v_target = 'alex' then
    raise exception 'refusing to reset alex via admin RPC (sign in normally)';
  end if;

  -- Re-hash. If your players table uses a different column name (e.g. just
  -- "password" or "hashed_password"), edit the SET clause here.
  update public.players
     set password_hash = crypt(p_new_password, gen_salt('bf'))
   where lower(username) = v_target;

  if not found then
    raise exception 'user not found: %', v_target;
  end if;

  -- Invalidate all of the target's existing sessions so they're forced to
  -- log in again with the new password. Comment out if you'd rather keep
  -- the user logged in on their existing devices.
  begin
    delete from public.player_sessions
     where player_id in (select id from public.players where lower(username) = v_target);
  exception when others then
    -- non-fatal; just means the sessions table doesn't have that shape.
    null;
  end;
end;
$$;

grant execute on function public.admin_reset_password(text, text, text, text) to anon, authenticated;
