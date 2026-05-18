-- Daily 67 Clicker leaderboard.
-- ─────────────────────────────────────────────────────────────────────────
-- Reads `dailyPeak` + `dailyDate` from the save JSON (client maintains them).
-- Only returns rows for the current UTC date, so the board self-resets at
-- midnight UTC without needing a cron job.

create or replace function public.get_clicker_leaderboard_daily()
returns table (
  username      text,
  today_points  bigint,
  rebirths      int,
  updated_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.username,
         coalesce((cs.save->>'dailyPeak')::bigint, 0)  as today_points,
         coalesce((cs.save->>'rebirths')::int, 0)      as rebirths,
         cs.updated_at
    from public.clicker_saves cs
    join public.players p on p.id = cs.player_id
   where (cs.save->>'dailyDate') = to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD')
     and coalesce((cs.save->>'dailyPeak')::bigint, 0) > 0
   order by coalesce((cs.save->>'dailyPeak')::bigint, 0) desc
   limit 100;
$$;

grant execute on function public.get_clicker_leaderboard_daily() to anon, authenticated;
