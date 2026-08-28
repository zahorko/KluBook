-- =========================================================
-- KluBook — gamifikácia: XP, levely, goldy a klubový obchod
-- ---------------------------------------------------------
-- Spustite raz v Supabase: SQL Editor → New query → vložiť → Run.
-- Dá sa spustiť aj opakovane.
--
-- XP a levely sa nikam neukladajú — appka ich počíta z podujatí
-- a dochádzky, ktoré už v databáze sú. Ukladať treba len to, čo sa
-- inak nedá odvodiť: ponuku obchodu a kto si čo vybral.
-- =========================================================

-- 1) Nastavenie gamifikácie (koľko XP za čo, levelovacia krivka, goldy).
alter table public.club_settings
  add column if not exists gamification jsonb;

comment on column public.club_settings.gamification is
  'XP za tréning, tvar levelovacej krivky a goldy za level — meniteľné priamo v appke.';

-- 2) Ponuka klubového obchodu.
create table if not exists public.shop_items (
  id          text primary key,
  name        text not null,
  description text not null default '',
  price       integer not null default 10 check (price >= 0),
  kind        text not null default 'vec' check (kind in ('vec', 'vyhoda')),
  active      boolean not null default true,
  ord         integer not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.shop_items is
  'Čo si deti môžu kúpiť za goldy. kind = vec (hmotná odmena) alebo vyhoda (klubová výsada).';

-- 3) Čo si kto kúpil. Zostatok goldov = zarobené mínus tieto nákupy.
create table if not exists public.purchases (
  id         text primary key,
  student_id text not null references public.students (id) on delete cascade,
  item_id    text references public.shop_items (id) on delete set null,
  item_name  text not null,
  price      integer not null default 0,
  at         timestamptz not null default now(),
  delivered  boolean not null default false,
  note       text not null default ''
);

comment on table public.purchases is
  'Vybrané odmeny. item_name držíme aj samostatne, nech nákup prežije zmazanie položky z ponuky.';

create index if not exists idx_purchases_student on public.purchases (student_id);

-- 4) Prístup: rovnako ako pri ostatných tabuľkách, len aktívny tréner.
grant select, insert, update, delete on public.shop_items to authenticated;
grant select, insert, update, delete on public.purchases  to authenticated;

alter table public.shop_items enable row level security;
alter table public.purchases  enable row level security;

drop policy if exists klubook_trainers_all on public.shop_items;
create policy klubook_trainers_all on public.shop_items
  for all to authenticated using (public.is_trainer()) with check (public.is_trainer());

drop policy if exists klubook_trainers_all on public.purchases;
create policy klubook_trainers_all on public.purchases
  for all to authenticated using (public.is_trainer()) with check (public.is_trainer());

select 'Gamifikácia je pripravená.' as vysledok;
