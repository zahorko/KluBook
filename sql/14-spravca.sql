-- =========================================================
-- KluBook — správca klubu
-- ---------------------------------------------------------
-- Zakladať účty ďalším trénerom smie len správca.
-- Spustite raz v Supabase: SQL Editor → New query → vložiť → Run.
-- =========================================================
alter table public.trainers
  add column if not exists is_admin boolean not null default false;

update public.trainers t set is_admin = true
where t.id = (select id from public.trainers order by created_at asc limit 1)
  and not exists (select 1 from public.trainers where is_admin);

-- Poistka: tréner si nesmie sám pripísať práva správcu ani cez REST rozhranie.
create or replace function public.chran_spravcu()
returns trigger language plpgsql security definer set search_path = public as $$
declare volajuci_je_spravca boolean;
begin
  select coalesce(bool_or(is_admin), false) into volajuci_je_spravca
  from public.trainers where id = auth.uid();
  if tg_op = 'INSERT' then
    if new.is_admin and not volajuci_je_spravca then new.is_admin := false; end if;
    return new;
  end if;
  if new.is_admin is distinct from old.is_admin and not volajuci_je_spravca then
    new.is_admin := old.is_admin;
  end if;
  return new;
end $$;

drop trigger if exists chran_spravcu on public.trainers;
create trigger chran_spravcu
  before insert or update on public.trainers
  for each row execute function public.chran_spravcu();

select 'Správca je nastavený.' as vysledok;
