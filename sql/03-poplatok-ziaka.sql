-- =========================================================
-- KluBook — individuálny mesačný poplatok žiaka
-- ---------------------------------------------------------
-- Spustite raz v Supabase: SQL Editor → New query → vložiť → Run.
-- Dá sa spustiť aj opakovane, nič nepokazí.
--
-- Doteraz mali všetci žiaci rovnaký klubový poplatok. Po tejto
-- zmene môže mať každý žiak vlastnú sumu (napr. keď chodí len
-- na časť tréningov). Prázdna hodnota = platí klubový poplatok.
-- =========================================================

alter table public.students
  add column if not exists monthly_fee numeric(8, 2);

comment on column public.students.monthly_fee is
  'Vlastný mesačný poplatok žiaka. NULL = použije sa klubový poplatok z club_settings.';

-- Kontrola: kto má vlastnú sumu
select name, monthly_fee
from public.students
where monthly_fee is not null
order by name;
