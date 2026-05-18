-- Daily 67 Clicker leaderboard.
-- ─────────────────────────────────────────────────────────────────────────
-- Returns any player whose save was updated within the current UTC day.
-- If the save has today's `dailyPeak` (the client-tracked daily high), use
-- it as the score. Otherwise fall back to `max_points` so a player who
-- hasn't yet pushed a dailyPeak (e.g. still on an older client cache) still
-- appears on the board rather than vanishing entirely.
--
-- Anyone whose save wasn't updated today is excluded — that's how "today"
-- self-resets at UTC midnight with no cron.

create or replace function public.get_clicker_leaderboard_daily()
returns table (
  username     text,
  today_points bigint,
  rebirths     int,
  updated_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.username,
         case
           when (cs.save->>'dailyDate') = to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD')
                then coalesce((cs.save->>'dailyPeak')::bigint, 0)
           else coalesce(cs.max_points, 0)::bigint
         end as today_points,
         coalesce((cs.save->>'rebirths')::int, 0) as rebirths,
         cs.updated_at
    from public.clicker_saves cs
    join public.players p on p.id = cs.player_id
   where cs.updated_at >= (now() at time zone 'UTC')::date
     and (
       coalesce((cs.save->>'dailyPeak')::bigint, 0) > 0
       or coalesce(cs.max_points, 0) > 0
     )
   order by
     case
       when (cs.save->>'dailyDate') = to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD')
            then coalesce((cs.save->>'dailyPeak')::bigint, 0)
       else coalesce(cs.max_points, 0)::bigint
     end desc
   limit 100;
$$;

grant execute on function public.get_clicker_leaderboard_daily() to anon, authenticated;
