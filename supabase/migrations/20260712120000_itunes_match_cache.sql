create table if not exists public.itunes_match_cache (
  norm_key text primary key,
  preview_url text,
  match_score double precision not null default 0,
  release_year integer,
  artwork_url text,
  matched_title text,
  matched_artist text,
  cached_at timestamptz not null default now()
);

alter table public.itunes_match_cache enable row level security;

revoke all on table public.itunes_match_cache from anon, authenticated;

comment on table public.itunes_match_cache is
  'Short-lived server-side cache for validated iTunes song matches used during deck generation.';
