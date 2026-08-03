-- =========================================================
-- KluBook — schéma databázy pre Supabase
-- ---------------------------------------------------------
-- Kam to vložiť: Supabase → SQL Editor → New query → vložiť
-- celý tento súbor → Run. Skript sa dá spustiť aj opakovane,
-- nič neprepíše a nič nezmaže.
-- =========================================================

-- ---------- tabuľky ----------

-- Tréneri. id je zhodné s účtom v Supabase Authentication.
create table if not exists public.trainers (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  initials   text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Tréningové skupiny.
create table if not exists public.groups (
  id    text primary key,
  name  text not null,
  short text default '',
  ord   integer not null default 0
);

-- Žiaci.
create table if not exists public.students (
  id            text primary key,
  name          text not null,
  group_id      text not null references public.groups (id),
  contact_name  text default '',
  contact_phone text default '',
  contact_email text default '',
  note          text default '',
  start_date    date not null default current_date,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Odučené tréningy (dochádzka trénerov).
create table if not exists public.sessions (
  id         text primary key,
  trainer_id uuid references public.trainers (id) on delete set null,
  group_id   text not null references public.groups (id),
  date       date not null,
  start_time time not null,
  end_time   time,
  note       text default '',
  created_at timestamptz not null default now()
);

-- Dochádzka žiakov. Jeden žiak = jeden záznam na tréning.
create table if not exists public.attendance (
  id         text primary key,
  session_id text not null references public.sessions (id) on delete cascade,
  student_id text not null references public.students (id) on delete cascade,
  present    boolean not null default true,
  at         timestamptz not null default now(),
  unique (session_id, student_id)
);

-- Platby. Jeden žiak = jeden záznam na mesiac.
create table if not exists public.payments (
  id         text primary key,
  student_id text not null references public.students (id) on delete cascade,
  period     text not null,                    -- 'RRRR-MM'
  status     text not null default 'unpaid' check (status in ('paid', 'unpaid')),
  paid_date  date,
  amount     numeric(8, 2),
  note       text default '',
  unique (student_id, period)
);

-- Nastavenia klubu (jediný riadok).
create table if not exists public.club_settings (
  id         integer primary key default 1 check (id = 1),
  club_name  text not null default '1. Šachový klub Košice',
  short_name text not null default '1. ŠK Košice',
  motto      text default 'Nie sme len šachový klub, sme komunita.',
  fee        numeric(8, 2) not null default 25
);

-- rýchlejšie vyhľadávanie
create index if not exists idx_sessions_date on public.sessions (date);
create index if not exists idx_attendance_student on public.attendance (student_id);
create index if not exists idx_payments_period on public.payments (period);

-- ---------- východiskové dáta ----------

insert into public.groups (id, name, short, ord) values
  ('grp_zac', 'Začiatočníci',     'Z', 1),
  ('grp_mie', 'Mierne pokročilí', 'M', 2),
  ('grp_pok', 'Pokročilí',        'P', 3)
on conflict (id) do nothing;

insert into public.club_settings (id) values (1)
on conflict (id) do nothing;

-- ---------- bezpečnosť (Row Level Security) ----------
-- Do dát sa dostane len prihlásený a aktívny tréner.
-- Kto nie je v tabuľke trainers, nevidí ani riadok — bráni tomu
-- samotná databáza, nie appka.

create or replace function public.is_trainer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trainers t
    where t.id = auth.uid() and t.active
  );
$$;

revoke all on function public.is_trainer() from public;
grant execute on function public.is_trainer() to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['trainers', 'groups', 'students', 'sessions', 'attendance', 'payments', 'club_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists klubook_trainers_all on public.%I', t);
    execute format(
      'create policy klubook_trainers_all on public.%I for all to authenticated using (public.is_trainer()) with check (public.is_trainer())',
      t
    );
  end loop;
end $$;

-- Hotovo. Ďalej pokračujte súborom 02-pridat-trenera.sql.
