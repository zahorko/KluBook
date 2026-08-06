-- =========================================================
-- KluBook — pravidelný rozvrh tréningov
-- ---------------------------------------------------------
-- Spustite raz v Supabase: SQL Editor → New query → vložiť → Run.
-- Dá sa spustiť aj opakovane.
--
-- Appka bude vedieť, že napr. v utorok o 16:00 sú Začiatočníci:
--   • na hlavnej obrazovke ponúkne dnešný tréning jedným ťuknutím,
--   • všimne si, keď ste tréning vôbec nezapísali.
-- =========================================================

create table if not exists public.schedule (
  id            text primary key,
  group_id      text not null references public.groups (id) on delete cascade,
  weekday       integer not null check (weekday between 0 and 6),  -- 0 = nedeľa
  start_time    time not null,
  end_time      time not null,
  trainer_id    uuid references public.trainers (id) on delete set null,
  active        boolean not null default true,
  skipped_dates text[] not null default '{}',   -- dni, keď tréning výnimočne nebol
  created_at    timestamptz not null default now()
);

comment on table public.schedule is
  'Pravidelný týždenný rozvrh. Nevytvára tréningy sám — len ich ponúka a upozorní na chýbajúce.';

-- prístup rovnaký ako pri ostatných tabuľkách: len aktívny tréner
grant select, insert, update, delete on public.schedule to authenticated;
alter table public.schedule enable row level security;
drop policy if exists klubook_trainers_all on public.schedule;
create policy klubook_trainers_all on public.schedule
  for all to authenticated
  using (public.is_trainer()) with check (public.is_trainer());

select 'Tabuľka rozvrhu je pripravená.' as vysledok;
