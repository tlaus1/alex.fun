-- Optional: lets the client mark a DM thread as read on the server so the
-- red unread badge stays cleared after a page reload.
-- ─────────────────────────────────────────────────────────────────────────
-- Assumes a `public.messages` table with at least:
--   sender_id    uuid  (FK → players.id)
--   recipient_id uuid  (FK → players.id)
--   read_at      timestamptz
-- Edit the column names below if your schema differs.

create or replace function public.mark_messages_read(
  p_token           text,
  p_other_username  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid;
  v_other uuid;
begin
  select s.player_id into v_me
    from public.player_sessions s
   where s.token = p_token
     and (s.expires_at is null or s.expires_at > now())
   limit 1;
  if v_me is null then return; end if;

  select id into v_other
    from public.players
   where lower(username) = lower(trim(p_other_username))
   limit 1;
  if v_other is null then return; end if;

  update public.messages
     set read_at = coalesce(read_at, now())
   where recipient_id = v_me
     and sender_id    = v_other
     and read_at is null;
end;
$$;

grant execute on function public.mark_messages_read(text, text) to anon, authenticated;
