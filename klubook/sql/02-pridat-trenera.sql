-- =========================================================
-- KluBook — pridanie trénera
-- ---------------------------------------------------------
-- Použite vždy, keď pribudne nový tréner.
--
-- Postup:
-- 1) Supabase → Authentication → Users → Add user →
--    zadajte e-mail a heslo, zaškrtnite "Auto Confirm User".
-- 2) Sem nižšie prepíšte e-mail, meno a iniciály a spustite
--    (SQL Editor → Run).
--
-- Bez tohto kroku sa tréner síce prihlási, ale appka mu povie,
-- že účet ešte nie je aktivovaný.
-- =========================================================

insert into public.trainers (id, name, initials, active)
select u.id, 'Jakub Zahorček', 'JZ', true
from auth.users u
where u.email = 'sem@vlozte-email.sk'
on conflict (id) do update
  set name     = excluded.name,
      initials = excluded.initials,
      active   = true;

-- Kontrola: kto je zapísaný ako tréner
select t.name, t.initials, t.active, u.email
from public.trainers t
join auth.users u on u.id = t.id
order by t.name;


-- ---------------------------------------------------------
-- Odobratie prístupu trénerovi (história ostane zachovaná):
--
-- update public.trainers set active = false
-- where id = (select id from auth.users where email = 'byvaly@treneri.sk');
-- ---------------------------------------------------------
