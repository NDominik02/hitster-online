# Featured Decks

Recommended decks are ready-made decks stored in `decks` and `deck_cards`.
The host screen lists decks where:

- `status = 'ready'`
- `is_public = true`
- `report.featured = true`

Selecting one of these decks does not fetch Spotify again. It reuses the stored
deck metadata and cards.

## Curator Flow

Normal users generate private decks in either `spotify_only` mode or
`accurate_spotify` mode. Neither mode uploads preview audio to Supabase Storage;
both require Spotify Premium playback.

Admins can generate `verified_audio` copies. These use the same accurate
MusicBrainz/iTunes year pipeline as `accurate_spotify`, but also store preview
audio in Supabase Storage. This is reserved for the small set of decks that must
remain playable without Spotify Premium.

Admins are allowlisted in `admin_users` by `spotify_user_id`. The host create
page shows an `Admin` tab only for connected admin/curator accounts.

Curators have two preparation flows:

- Paste playlist links in the Admin tab and run `Letoltott verzio keszitese`.
  This creates a new `verified_audio` deck and stores uploaded preview audio.
- Pick a `spotify_only` deck in the admin list and run
  `Megbizhato verzio keszitese`. This creates an `accurate_spotify` copy with
  more reliable years, but does not upload preview audio.

Prepared decks can be published with `Ajanlottkent megjelenit`.

The publish step calls `set_featured_deck`; direct browser writes to `decks` are
not allowed. Publishing is rejected if the deck is still `spotify_only`, is not
ready, has fewer than 60 usable cards, or still contains too few playable cards.

## Remove From Recommended

Admins can use `Elrejtes ajanlottbol` in the same tab. This removes the featured
report flags and sets `is_public = false`, so the curated copy disappears from
the recommended list without touching the original user deck.

## Ownership Notes

Prepared featured decks are separate curated copies. When a `spotify_only`
source deck is replaced by an `accurate_spotify` or `verified_audio` copy, the
source deck is deleted immediately if no room references it. If an existing room
still points at the source deck, it is first hidden with `status = 'deleted'`
and `is_public = false` so active games cannot break.

The `cleanup_deleted_decks` Edge Function permanently removes hidden decks after
rooms no longer reference them. It deletes Storage audio first, then `deck_cards`,
then the `decks` row. `supabase/cleanup_deleted_decks_cron.sql` schedules this
cleanup every six hours.

In-game year disputes always correct the current round. A persistent `deck_cards`
update still depends on the host owning/managing the deck.
