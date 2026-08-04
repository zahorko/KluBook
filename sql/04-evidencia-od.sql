-- =========================================================
-- KluBook — od kedy klub eviduje platby
-- ---------------------------------------------------------
-- Spustite raz v Supabase: SQL Editor → New query → vložiť → Run.
-- Dá sa spustiť aj opakovane.
--
-- Prehľady potom nezobrazujú mesiace spred tohto dátumu —
-- netreba sa prehrabávať prázdnou minulosťou.
-- Hodnotu zmeníte v appke: Viac → Klub → „Evidencia platieb od".
-- =========================================================

alter table public.club_settings
  add column if not exists tracking_since text;

comment on column public.club_settings.tracking_since is
  'Mesiac vo formáte RRRR-MM, od ktorého sa v prehľadoch zobrazujú platby.';

update public.club_settings
set tracking_since = to_char(current_date, 'YYYY-MM')
where id = 1 and tracking_since is null;

select club_name, fee, tracking_since from public.club_settings;
