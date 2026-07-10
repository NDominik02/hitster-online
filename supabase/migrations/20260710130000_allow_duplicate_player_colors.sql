drop index if exists public.players_room_color_idx;

comment on column public.players.color is
  'Player-selected display color. Multiple players in the same room may choose the same color.';
