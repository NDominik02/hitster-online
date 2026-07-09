# Featured Decks

Recommended decks are ready-made decks stored in `decks` and `deck_cards`.
The host screen lists decks where:

- `status = 'ready'`
- `is_public = true`
- `report.featured = true`

Selecting one of these decks does not fetch Spotify again. It reuses the stored
deck metadata, cards, and uploaded audio.

## Promote A Deck

```sql
update public.decks
set
  is_public = true,
  report = coalesce(report, '{}'::jsonb)
    || jsonb_build_object(
      'featured', true,
      'featuredAt', now()
    )
where id = '<deck-id>';
```

## Remove From Recommended

```sql
update public.decks
set report = coalesce(report, '{}'::jsonb) - 'featured' - 'featuredAt' - 'featuredBy'
where id = '<deck-id>';
```

## Start With An Empty Recommended List

```sql
update public.decks
set report = coalesce(report, '{}'::jsonb) - 'featured' - 'featuredAt' - 'featuredBy'
where report @> '{"featured": true}'::jsonb;
```
