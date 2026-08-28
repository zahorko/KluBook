-- =========================================================
-- KluBook — platba za tréning namiesto mesačného poplatku
-- ---------------------------------------------------------
-- Spustite raz v Supabase: SQL Editor → New query → vložiť → Run.
-- Dá sa spustiť aj opakovane.
--
-- Platba býva priamo pri zázname o dochádzke, lebo tam vzniká:
-- jeden tréning, jeden žiak, jedno ťuknutie. Kto neprišiel, nemá
-- záznam — a teda ani čo platiť.
-- =========================================================

alter table public.attendance
  add column if not exists paid boolean not null default false,
  add column if not exists paid_amount numeric(6,2);

comment on column public.attendance.paid is
  'Či žiak za tento tréning zaplatil.';
comment on column public.attendance.paid_amount is
  'Koľko naozaj zaplatil. Držíme sumu, nie odkaz na cenník — neskoršia zmena ceny nesmie prepísať históriu.';

create index if not exists idx_attendance_paid on public.attendance (paid);

comment on column public.club_settings.fee is 'Cena jedného tréningu v eurách.';
comment on column public.students.monthly_fee is
  'Vlastná cena tréningu tohto žiaka. Prázdne = klubová cena.';

-- Mesačné platby sa už nepoužívajú. Tabuľku necháme prázdnu stáť —
-- zahodiť sa dá až vtedy, keď si budete istý, že ju netreba.
-- delete from public.payments;

select 'Platba za tréning je pripravená.' as vysledok;
