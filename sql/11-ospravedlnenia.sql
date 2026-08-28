-- =========================================================
-- KluBook — vopred ohlásené neúčasti
-- ---------------------------------------------------------
-- Spustite raz v Supabase: SQL Editor → New query → vložiť → Run.
-- Dá sa spustiť aj opakovane.
-- =========================================================
create table if not exists public.absences (
  id         text primary key,
  student_id text not null references public.students (id) on delete cascade,
  date       date not null,
  note       text not null default '',
  created_at timestamptz not null default now(),
  unique (student_id, date)
);

comment on table public.absences is
  'Vopred ohlásené neúčasti. Platba sa neúčtuje, lebo sa účtuje len za odtrénovanú hodinu.';

create index if not exists idx_absences_date on public.absences (date);

grant select, insert, update, delete on public.absences to authenticated;
alter table public.absences enable row level security;

drop policy if exists klubook_trainers_all on public.absences;
create policy klubook_trainers_all on public.absences
  for all to authenticated using (public.is_trainer()) with check (public.is_trainer());

select 'Ospravedlnenia sú pripravené.' as vysledok;
