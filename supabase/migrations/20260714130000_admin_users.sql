create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  spotify_user_id text not null unique,
  role text not null default 'curator' check (role in ('curator', 'admin')),
  display_name text,
  created_by uuid,
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

create index if not exists admin_users_active_spotify_idx
  on public.admin_users (spotify_user_id)
  where disabled_at is null;

alter table public.admin_users enable row level security;

revoke all on public.admin_users from anon, authenticated;

comment on table public.admin_users is
  'Curator/admin allowlist for featured deck management. Read by Edge Functions with service role only.';
