-- Allow adding more members to an existing group chat.
-- Only existing members can invite (prevents random users from forcing entry).

create or replace function public.add_group_members(
  p_token            text,
  p_group_id         uuid,
  p_member_usernames text[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid;
  v_added     int := 0;
  v_member_id uuid;
  v_username  text;
begin
  v_me := public._player_from_token(p_token);
  if v_me is null then raise exception 'invalid or expired session'; end if;

  if not exists (select 1 from public.group_members where group_id = p_group_id and player_id = v_me) then
    raise exception 'only existing members can add others to a group';
  end if;

  if p_member_usernames is null then return 0; end if;

  foreach v_username in array p_member_usernames loop
    select id into v_member_id from public.players where lower(username) = lower(trim(v_username)) limit 1;
    if v_member_id is not null then
      insert into public.group_members (group_id, player_id)
           values (p_group_id, v_member_id)
      on conflict do nothing;
      if found then v_added := v_added + 1; end if;
    end if;
  end loop;
  return v_added;
end;
$$;

grant execute on function public.add_group_members(text, uuid, text[]) to anon, authenticated;
