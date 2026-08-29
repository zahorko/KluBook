-- =========================================================
-- KluBook — klubová pokladňa a kto platbu prevzal
-- ---------------------------------------------------------
-- Spustite raz v Supabase: SQL Editor → New query → vložiť → Run.
-- Dá sa spustiť aj opakovane.
-- =========================================================
alter table public.attendance
  add column if not exists paid_by uuid references public.trainers (id) on delete set null;

comment on column public.attendance.paid_by is
  'Tréner, ktorý platbu zapísal — teda ten, kto tie peniaze fyzicky prevzal.';

create table if not exists public.handovers (
  id         text primary key,
  trainer_id uuid not null references public.trainers (id) on delete cascade,
  amount     numeric(8,2) not null check (amount > 0),
  at         date not null,
  note       text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.handovers is
  'Odovzdanie vybratej hotovosti do klubovej pokladne. Rozdiel voči vybratému = koľko má tréner ešte u seba.';

create index if not exists idx_handovers_trainer on public.handovers (trainer_id);

grant select, insert, update, delete on public.handovers to authenticated;
alter table public.handovers enable row level security;

drop policy if exists klubook_trainers_all on public.handovers;
create policy klubook_trainers_all on public.handovers
  for all to authenticated using (public.is_trainer()) with check (public.is_trainer());

select 'Pokladňa je pripravená.' as vysledok;
