alter table public.rounds
  add column if not exists next_ready_player_ids uuid[] not null default '{}'::uuid[];

alter table public.players
  add column if not exists kicked_at timestamptz;

create or replace view public.round_public
with (security_invoker = true)
as
select
  r.id,
  r.room_id,
  r.round_no,
  r.active_player_id,
  r.phase,
  r.placement,
  r.outcome,
  r.placing_deadline,
  r.steal_deadline,
  case when r.phase in ('reveal', 'done') then r.revealed_card else null end as revealed_card,
  r.next_ready_player_ids
from public.rounds r;

create or replace function public.mark_next_round_ready(p_round_id uuid, p_player_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  next_ids uuid[];
begin
  update public.rounds
  set next_ready_player_ids = (
    select coalesce(array_agg(distinct ready_id), '{}'::uuid[])
    from unnest(rounds.next_ready_player_ids || p_player_id) as ready_id
  )
  where id = p_round_id
  returning next_ready_player_ids into next_ids;

  return coalesce(next_ids, '{}'::uuid[]);
end;
$$;

revoke all on function public.mark_next_round_ready(uuid, uuid) from public;
grant execute on function public.mark_next_round_ready(uuid, uuid) to service_role;
