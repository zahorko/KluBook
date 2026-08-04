-- =========================================================
-- KluBook — upozornenie na žiakov, ktorí prestávajú chodiť
-- ---------------------------------------------------------
-- Spustite raz v Supabase: SQL Editor → New query → vložiť → Run.
-- Dá sa spustiť aj opakovane.
--
-- Appka upozorní na žiaka, ktorý vymeškal 3 tréningy za sebou.
-- Keď sa rodičom ozvete a ťuknete na „Vybavené", zapíše sa sem dátum
-- a upozornenie zmizne — až kým dieťa nezačne chýbať znova.
-- =========================================================

alter table public.students
  add column if not exists contacted_at date;

comment on column public.students.contacted_at is
  'Kedy sa tréner naposledy ozval rodičom kvôli vymeškávaniu.';

select name, contacted_at from public.students where contacted_at is not null order by contacted_at desc;
