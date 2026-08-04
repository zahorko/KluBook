-- =========================================================
-- KluBook — žiak môže byť vo viacerých skupinách + online skupiny
-- ---------------------------------------------------------
-- Spustite raz v Supabase: SQL Editor → New query → vložiť → Run.
-- Dá sa spustiť aj opakovane.
--
-- Doteraz patril žiak práve do jednej skupiny. Po tejto zmene môže
-- byť napríklad v „Pokročilí" aj „Pokročilí online" — ostáva pritom
-- jedným žiakom s jednou kartou, jedným poplatkom a jednou históriou.
-- =========================================================

-- zoznam skupín, do ktorých žiak patrí
alter table public.students
  add column if not exists group_ids text[];

-- doterajších žiakov presunieme do zoznamu (ich pôvodná skupina)
update public.students
set group_ids = array[group_id]
where group_ids is null or cardinality(group_ids) = 0;

comment on column public.students.group_ids is
  'Všetky skupiny žiaka. Prvá je hlavná — pod ňou sa zobrazuje v platbách.';

-- nové online skupiny
insert into public.groups (id, name, short, ord) values
  ('grp_mie_on', 'Mierne pokročilí online', 'M online', 4),
  ('grp_pok_on', 'Pokročilí online',        'P online', 5)
on conflict (id) do nothing;

select id, name, ord from public.groups order by ord;
