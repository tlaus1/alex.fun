-- 67 Clicker leaderboard v2 — surfaces rebirth count.
-- ─────────────────────────────────────────────────────────────────────────
-- Adds a new RPC that returns each player's max_points AND rebirths
-- (extracted from the JSON save). The client sorts by rebirths first, then
-- points, so rebirthing is finally rewarded on the public board.
--
-- Assumes the existing table is `public.clicker_saves` with columns
--   player_id  uuid       (FK → public.players.id)
--   save       jsonb      (the full game state; contains "rebirths" field)
--   max_points bigint     (denormalised highest score)
--   updated_at timestamptz
-- If your table or column names differ, edit the FROM clause below.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_clicker_leaderboard_v2()
returns table (
  username    text,
  max_points  bigint,
  rebirths    int,
  updated_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.username,
         coalesce(cs.max_points, 0)::bigint                  as max_points,
         coalesce((cs.save->>'rebirths')::int, 0)            as rebirths,
         cs.updated_at
    from public.clicker_saves cs
    join public.players p on p.id = cs.player_id
   where coalesce(cs.max_points, 0) > 0
   order by coalesce((cs.save->>'rebirths')::int, 0) desc,
            coalesce(cs.max_points, 0) desc
   limit 100;
$$;

grant execute on function public.get_clicker_leaderboard_v2() to anon, authenticated;
