-- admin_set_user_multiplier — Alex can set a target player's multiplier.
-- ─────────────────────────────────────────────────────────────────────────
-- Writes the value into clicker_saves.save->'adminMultiplier'. The target
-- client picks it up on its next load (applySavedGame reads that field).

create or replace function public.admin_set_user_multiplier(
  p_token           text,
  p_target_username text,
  p_multiplier      int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller   text;
  v_target_id uuid;
begin
  if p_multiplier is null or p_multiplier < 1 then
    raise exception 'multiplier must be at least 1';
  end if;

  select p.username
    into v_caller
  from public.player_sessions s
  join public.players p on p.id = s.player_id
  where s.token = p_token
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
  if v_caller is null then raise exception 'invalid or expired session'; end if;
  if lower(v_caller) <> 'alex' then raise exception 'only alex can set multipliers'; end if;

  select id into v_target_id
    from public.players
   where lower(username) = lower(trim(p_target_username))
   limit 1;
  if v_target_id is null then raise exception 'user not found: %', p_target_username; end if;

  -- Upsert the row so we can set the multiplier even for players who haven't
  -- saved yet. jsonb_set with create_missing=true means we don't blow up if
  -- save is null/empty.
  insert into public.clicker_saves (player_id, save, updated_at)
       values (v_target_id, jsonb_build_object('adminMultiplier', p_multiplier), now())
  on conflict (player_id) do update
       set save       = jsonb_set(coalesce(public.clicker_saves.save, '{}'::jsonb),
                                  '{adminMultiplier}',
                                  to_jsonb(p_multiplier),
                                  true),
           updated_at = now();
end;
$$;

grant execute on function public.admin_set_user_multiplier(text, text, int) to anon, authenticated;
