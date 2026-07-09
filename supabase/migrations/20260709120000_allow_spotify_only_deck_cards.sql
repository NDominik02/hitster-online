alter table public.deck_cards
  alter column audio_url drop not null;

comment on column public.deck_cards.audio_url is
  'Private deck-audio storage path for preview playback. Null for Spotify-only cards that require spotify_uri playback.';
