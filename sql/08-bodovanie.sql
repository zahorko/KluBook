-- =========================================================
-- KluBook — klubové bodovanie za hranie (ligy a turnaje)
-- ---------------------------------------------------------
-- Spustite raz v Supabase: SQL Editor → New query → vložiť → Run.
-- Dá sa spustiť aj opakovane.
-- =========================================================

-- 1) Človek, ktorý za klub hrá, ale nechodí na tréningy.
--    Nepýta sa mu poplatok a nie je v žiadnej tréningovej skupine.
alter table public.students
  add column if not exists trains boolean not null default true;

comment on column public.students.trains is
  'false = hrá za klub, ale nechodí na tréningy (nefiguruje v platbách ani v skupinách).';

-- 2) Podujatia — ligové kolo, turnaj, iné.
create table if not exists public.events (
  id         text primary key,
  name       text not null,
  kind       text not null default 'turnaj' check (kind in ('liga', 'turnaj', 'ine')),
  date       date not null,
  place      text default '',
  note       text default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_events_date on public.events (date);

-- 3) Kto sa zúčastnil a s akým výsledkom.
create table if not exists public.event_results (
  id         text primary key,
  event_id   text not null references public.events (id) on delete cascade,
  student_id text not null references public.students (id) on delete cascade,
  wins       integer not null default 0,
  draws      integer not null default 0,
  losses     integer not null default 0,
  placement  integer,                       -- umiestnenie v turnaji, nepovinné
  bonus      numeric(6, 2) not null default 0,
  points     numeric(6, 2) not null default 0,
  note       text default '',
  unique (event_id, student_id)
);

create index if not exists idx_event_results_student on public.event_results (student_id);

-- 4) Pravidlá bodovania a sezóna — držíme v nastaveniach klubu.
alter table public.club_settings
  add column if not exists scoring jsonb;

alter table public.club_settings
  add column if not exists season_start date,
  add column if not exists season_end   date;

comment on column public.club_settings.scoring is
  'Body za účasť, výhru, remízu, prehru a umiestnenie — meniteľné priamo v appke.';

-- 5) Prístup: rovnako ako pri ostatných tabuľkách, len aktívny tréner.
grant select, insert, update, delete on public.events        to authenticated;
grant select, insert, update, delete on public.event_results to authenticated;

alter table public.events        enable row level security;
alter table public.event_results enable row level security;

drop policy if exists klubook_trainers_all on public.events;
create policy klubook_trainers_all on public.events
  for all to authenticated using (public.is_trainer()) with check (public.is_trainer());

drop policy if exists klubook_trainers_all on public.event_results;
create policy klubook_trainers_all on public.event_results
  for all to authenticated using (public.is_trainer()) with check (public.is_trainer());

select 'Bodovanie je pripravené.' as vysledok;
