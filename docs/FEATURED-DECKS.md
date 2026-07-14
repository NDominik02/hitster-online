# Featured Decks

Recommended decks are ready-made decks stored in `decks` and `deck_cards`.
The host screen lists decks where:

- `status = 'ready'`
- `is_public = true`
- `report.featured = true`

Selecting one of these decks does not fetch Spotify again. It reuses the stored
deck metadata, cards, and uploaded audio.

## Curator Flow

Normal users generate private decks in `spotify_only` mode. These decks do not
upload preview audio to Supabase Storage and require Spotify Premium playback.

Curators are allowlisted in `admin_users` by `spotify_user_id`. The host create
page shows a `Kuralas` tab only for connected curator accounts.

Curators should use this flow:

1. Pick a user/source deck in the curator list.
2. Run `Elokeszites`, which creates a new `verified_audio` copy from the source
   playlist and stores uploaded preview audio.
3. Publish the prepared copy with `Publikalas`.

The publish step calls `set_featured_deck`; direct browser writes to `decks` are
not allowed. Publishing is rejected if the deck is still `spotify_only`, is not
ready, has fewer than 60 usable cards, or still contains Spotify-only cards.

## Remove From Recommended

Curators can use `Levetel` in the same tab. This removes the featured report
flags and sets `is_public = false`, so the curated copy disappears from the
recommended list without touching the original user deck.

## Ownership Notes

Prepared featured decks are separate curated copies. The original user deck can
still be renamed, deleted, or edited by its owner without changing the public
recommended copy.

In-game year disputes always correct the current round. A persistent `deck_cards`
update still depends on the host owning/managing the deck.
