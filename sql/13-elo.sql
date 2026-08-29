-- =========================================================
-- KluBook — ELO zo Slovenského šachového zväzu
-- ---------------------------------------------------------
-- Spustite raz v Supabase: SQL Editor → New query → vložiť → Run.
-- Dá sa spustiť aj opakovane.
-- =========================================================
create table if not exists public.ssz_players (
  ssz_id     text primary key,
  name       text not null,
  club       text not null default '',
  rating     integer,
  fide_id    text,
  updated_at timestamptz not null default now()
);

comment on table public.ssz_players is
  'Kópia matriky SŠZ. Rating je jedno zlúčené číslo: národné ELO, a od 1400 vyššie priamo FIDE.';

create index if not exists idx_ssz_players_name on public.ssz_players (lower(name));

alter table public.students
  add column if not exists ssz_id    text,
  add column if not exists fide_id   text,
  add column if not exists rating    integer,
  add column if not exists rating_at date;

create index if not exists idx_students_ssz on public.students (ssz_id);

create table if not exists public.ratings (
  id         text primary key,
  student_id text not null references public.students (id) on delete cascade,
  at         date not null,
  rating     integer not null,
  unique (student_id, at)
);

grant select on public.ssz_players to authenticated;
grant select, insert, update, delete on public.ratings to authenticated;

alter table public.ssz_players enable row level security;
alter table public.ratings     enable row level security;

drop policy if exists klubook_trainers_read on public.ssz_players;
create policy klubook_trainers_read on public.ssz_players
  for select to authenticated using (public.is_trainer());

drop policy if exists klubook_trainers_all on public.ratings;
create policy klubook_trainers_all on public.ratings
  for all to authenticated using (public.is_trainer()) with check (public.is_trainer());

select 'ELO je pripravené.' as vysledok;
