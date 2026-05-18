-- list_online_usernames — returns lowercased usernames whose session is
-- still valid. Used by the friends list to show a presence dot.
-- ─────────────────────────────────────────────────────────────────────────
-- Public read (anyone can see who's online) — feel free to restrict via RLS
-- later if you want it friends-only.

create or replace function public.list_online_usernames()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct lower(p.username)
    from public.player_sessions s
    join public.players p on p.id = s.player_id
   where s.expires_at is null or s.expires_at > now();
$$;

grant execute on function public.list_online_usernames() to anon, authenticated;
