-- change_password — lets a signed-in player change their own password.
-- ─────────────────────────────────────────────────────────────────────────
-- Requires the CURRENT password as confirmation so a hijacked session
-- alone can't lock the legitimate owner out.

create extension if not exists pgcrypto;

create or replace function public.change_password(
  p_token            text,
  p_current_password text,
  p_new_password     text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_player_id uuid;
  v_hash      text;
begin
  if p_new_password is null or length(p_new_password) < 4 then
    raise exception 'new password must be at least 4 characters';
  end if;
  if p_current_password is null then
    raise exception 'current password required';
  end if;

  select p.id, p.password_hash
    into v_player_id, v_hash
  from public.player_sessions s
  join public.players p on p.id = s.player_id
  where s.token = p_token
    and (s.expires_at is null or s.expires_at > now())
  limit 1;

  if v_player_id is null then raise exception 'invalid or expired session'; end if;
  if v_hash is null or v_hash <> crypt(p_current_password, v_hash) then
    raise exception 'incorrect current password';
  end if;

  update public.players
     set password_hash = crypt(p_new_password, gen_salt('bf')),
         updated_at    = now()
   where id = v_player_id;

  -- Invalidate every OTHER session so other devices have to sign in fresh.
  -- The current session token stays valid.
  begin
    delete from public.player_sessions
     where player_id = v_player_id
       and token <> p_token;
  exception when others then null;
  end;
end;
$$;

grant execute on function public.change_password(text, text, text) to anon, authenticated;
