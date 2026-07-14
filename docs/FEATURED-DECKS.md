# Featured Decks

Recommended decks are ready-made decks stored in `decks` and `deck_cards`.
The host screen lists decks where:

- `status = 'ready'`
- `is_public = true`
- `report.featured = true`
- `report.starred = true`

Selecting one of these decks does not fetch Spotify again. It reuses the stored
deck metadata, cards, and uploaded audio.

## Curator Flow

Normal users generate private decks in `spotify_only` mode. These decks do not
upload preview audio to Supabase Storage and require Spotify Premium playback.

Starred decks are generated with the old, more accurate `verified_audio`
pipeline. They store preview audio in Supabase Storage. For now only admins can
generate starred decks. A recommended deck must be starred first.

Admins are allowlisted in `admin_users` by `spotify_user_id`. The host create
page shows an `Admin` tab only for connected admin/curator accounts.

Curators should use this flow:

1. Pick a user/source deck in the admin list.
2. Run `Csillagozott verzio keszitese`, which creates a new `verified_audio` copy
   from the source playlist and stores uploaded preview audio.
3. Publish the prepared copy with `Ajanlottkent megjelenit`.

The publish step calls `set_featured_deck`; direct browser writes to `decks` are
not allowed. Publishing is rejected if the deck is not starred, is still
`spotify_only`, is not ready, has fewer than 60 usable cards, or still contains
Spotify-only cards.

## Remove From Recommended

Admins can use `Elrejtes ajanlottbol` in the same tab. This removes the featured
report flags and sets `is_public = false`, so the curated copy disappears from
the recommended list without touching the original user deck.

## Ownership Notes

Prepared featured decks are separate curated copies. The original user deck can
still be renamed, deleted, or edited by its owner without changing the public
recommended copy.

In-game year disputes always correct the current round. A persistent `deck_cards`
update still depends on the host owning/managing the deck.
