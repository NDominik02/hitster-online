alter table public.decks
  add column if not exists spotify_owner_id text;

alter table public.spotify_connections
  add column if not exists display_name text;

update public.decks as deck
set spotify_owner_id = connection.spotify_user_id
from public.spotify_connections as connection
where deck.owner_id = connection.host_uid
  and deck.spotify_owner_id is null;

create index if not exists decks_spotify_owner_id_created_at_idx
  on public.decks (spotify_owner_id, created_at desc)
  where spotify_owner_id is not null;

create or replace function public.current_spotify_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select connection.spotify_user_id
  from public.spotify_connections as connection
  where connection.host_uid = auth.uid()
  limit 1;
$$;

revoke all on function public.current_spotify_user_id() from public;
grant execute on function public.current_spotify_user_id() to authenticated;

drop policy if exists decks_select on public.decks;
create policy decks_select on public.decks
for select to authenticated
using (
  is_public = true
  or (
    spotify_owner_id is null
    and owner_id = auth.uid()
  )
  or spotify_owner_id = public.current_spotify_user_id()
);

comment on column public.decks.spotify_owner_id is
  'Stable Spotify account identifier used for the private saved-deck library across anonymous Supabase sessions and devices.';

comment on function public.current_spotify_user_id() is
  'Returns the Spotify account connected to the current authenticated Supabase session without exposing spotify_connections.';
