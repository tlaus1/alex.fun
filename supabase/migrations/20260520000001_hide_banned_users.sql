-- Hide banned players from public user-listing surfaces.
-- ─────────────────────────────────────────────────────────────────────────
-- 1) list_public_players now excludes currently-banned accounts.
-- 2) list_banned_usernames is a new public read that returns lowercase
--    usernames of anyone currently banned — the client uses it to scrub
--    cached state too (in case other RPCs return banned users).
--
-- "Currently banned" = banned_at is set AND (ban_expires_at is null OR in the future).

create or replace function public.list_public_players(p_token text)
returns table (username text)
language sql
stable
security definer
set search_path = public
as $$
  select p.username
    from public.players p
   where p.banned_at is null
      or (p.ban_expires_at is not null and p.ban_expires_at <= now())
   order by p.username;
$$;

create or replace function public.list_banned_usernames()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select lower(p.username)
    from public.players p
   where p.banned_at is not null
     and (p.ban_expires_at is null or p.ban_expires_at > now());
$$;

grant execute on function public.list_public_players(text) to anon, authenticated;
grant execute on function public.list_banned_usernames()   to anon, authenticated;
