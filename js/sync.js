/* =========================================================
   sync.js — synchronizácia s databázou
   ---------------------------------------------------------
   Appka je „offline-first": všetko sa najprv zapíše lokálne
   (aby bola okamžitá odozva aj bez signálu v telocvični)
   a až potom sa odošle na server. Ak signál nie je, zmeny
   čakajú vo fronte a odošlú sa, keď sa pripojenie vráti.

   Pri konflikte platí posledný zápis (last write wins) —
   pre klubovú evidenciu úplne postačuje.
   ========================================================= */
import { CONFIG } from './config.js';
import { selectAll, upsertRows, deleteRow, ApiError } from './api.js';

const OUTBOX_KEY = 'klubook.outbox';
const META_KEY = 'klubook.syncmeta';
const MAX_ATTEMPTS = 5;

/* ---------------- prevod medzi appkou a databázou ---------------- */
/* Appka používa camelCase, databáza snake_case. */

const MAPPERS = {
  trainers: {
    toRow: (t) => ({ id: t.id, name: t.name, initials: t.initials, active: t.active !== false }),
    fromRow: (r) => ({
      id: r.id, name: r.name, initials: r.initials,
      active: r.active !== false, createdAt: r.created_at, groupIds: [],
    }),
  },
  groups: {
    toRow: (g) => ({ id: g.id, name: g.name, short: g.short, ord: g.order }),
    fromRow: (r) => ({ id: r.id, name: r.name, short: r.short, order: r.ord }),
  },
  students: {
    toRow: (s) => ({
      id: s.id, name: s.name,
      // null, nie undefined — undefined by JSON z riadku úplne vynechal
      group_id: s.groupId ?? null,
      contact_name: s.contactName || '', contact_phone: s.contactPhone || '',
      contact_email: s.contactEmail || '', note: s.note || '',
      start_date: s.startDate, active: s.active !== false,
      monthly_fee: s.monthlyFee === '' || s.monthlyFee === undefined ? null : s.monthlyFee,
      contacted_at: s.contactedAt ?? null,
      trains: s.trains !== false,
      // pole berieme doslova: prázdne pole znamená „bez skupiny", nie „doplň hlavnú"
      group_ids: Array.isArray(s.groupIds)
        ? s.groupIds.filter(Boolean)
        : (s.groupId ? [s.groupId] : []),
    }),
    fromRow: (r) => ({
      id: r.id, name: r.name, groupId: r.group_id,
      contactName: r.contact_name || '', contactPhone: r.contact_phone || '',
      contactEmail: r.contact_email || '', note: r.note || '',
      startDate: r.start_date, active: r.active !== false,
      monthlyFee: r.monthly_fee === null || r.monthly_fee === undefined ? null : Number(r.monthly_fee),
      contactedAt: r.contacted_at ?? null,
      trains: r.trains !== false,
      groupIds: Array.isArray(r.group_ids)
        ? r.group_ids.filter(Boolean)
        : (r.group_id ? [r.group_id] : []),
    }),
  },
  sessions: {
    toRow: (s) => ({
      id: s.id, trainer_id: s.trainerId, group_id: s.groupId, date: s.date,
      start_time: s.startTime, end_time: s.endTime, note: s.note || '',
    }),
    fromRow: (r) => ({
      id: r.id, trainerId: r.trainer_id, groupId: r.group_id, date: r.date,
      startTime: (r.start_time || '').slice(0, 5),
      endTime: r.end_time ? r.end_time.slice(0, 5) : null,
      note: r.note || '', createdAt: r.created_at,
    }),
  },
  attendance: {
    toRow: (a) => ({ id: a.id, session_id: a.sessionId, student_id: a.studentId, present: a.present, at: a.at }),
    fromRow: (r) => ({ id: r.id, sessionId: r.session_id, studentId: r.student_id, present: r.present, at: r.at }),
  },
  payments: {
    toRow: (p) => ({
      id: p.id, student_id: p.studentId, period: p.period, status: p.status,
      paid_date: p.paidDate, amount: p.amount, note: p.note || '',
    }),
    fromRow: (r) => ({
      id: r.id, studentId: r.student_id, period: r.period, status: r.status,
      paidDate: r.paid_date, amount: r.amount === null ? null : Number(r.amount), note: r.note || '',
    }),
  },
  schedule: {
    toRow: (r) => ({
      id: r.id, group_id: r.groupId, weekday: r.weekday,
      start_time: r.startTime, end_time: r.endTime,
      trainer_id: r.trainerId || null, active: r.active !== false,
      skipped_dates: r.skippedDates ?? [],
    }),
    fromRow: (r) => ({
      id: r.id, groupId: r.group_id, weekday: Number(r.weekday),
      startTime: (r.start_time || '').slice(0, 5),
      endTime: (r.end_time || '').slice(0, 5),
      trainerId: r.trainer_id ?? null, active: r.active !== false,
      skippedDates: r.skipped_dates ?? [], createdAt: r.created_at,
    }),
  },
  events: {
    toRow: (e) => ({
      id: e.id, name: e.name, kind: e.kind, date: e.date,
      place: e.place || '', note: e.note || '',
    }),
    fromRow: (r) => ({
      id: r.id, name: r.name, kind: r.kind, date: r.date,
      place: r.place || '', note: r.note || '', createdAt: r.created_at,
    }),
  },
  event_results: {
    toRow: (v) => ({
      id: v.id, event_id: v.eventId, student_id: v.studentId,
      wins: v.wins ?? 0, draws: v.draws ?? 0, losses: v.losses ?? 0,
      placement: v.placement ?? null, bonus: v.bonus ?? 0,
      points: v.points ?? 0, note: v.note || '',
    }),
    fromRow: (r) => ({
      id: r.id, eventId: r.event_id, studentId: r.student_id,
      wins: Number(r.wins) || 0, draws: Number(r.draws) || 0, losses: Number(r.losses) || 0,
      placement: r.placement ?? null, bonus: Number(r.bonus) || 0,
      points: Number(r.points) || 0, note: r.note || '',
    }),
  },
  club_settings: {
    toRow: (s) => ({
      id: 1, club_name: s.clubName, short_name: s.shortName, motto: s.motto,
      fee: s.fee, tracking_since: s.trackingSince ?? null,
      scoring: s.scoring ?? null,
      season_start: s.seasonStart ?? null, season_end: s.seasonEnd ?? null,
    }),
    fromRow: (r) => ({
      clubName: r.club_name, shortName: r.short_name, motto: r.motto,
      fee: Number(r.fee), trackingSince: r.tracking_since ?? null,
      scoring: r.scoring ?? null,
      seasonStart: r.season_start ?? null, seasonEnd: r.season_end ?? null,
    }),
  },
};

/* Poradie zápisu rešpektuje väzby (tréning musí existovať pred dochádzkou). */
const PUSH_ORDER = ['club_settings', 'trainers', 'groups', 'schedule', 'students', 'sessions', 'attendance', 'payments', 'events', 'event_results'];

/* Tabuľky, kde záznam poznáme aj podľa inej dvojice stĺpcov než id —
   keby dvaja tréneri zapísali to isté z dvoch zariadení. */
const CONFLICT_KEYS = {
  attendance: 'session_id,student_id',
  payments: 'student_id,period',
  event_results: 'event_id,student_id',
};

/* ---------------- stav pre UI ---------------- */
const listeners = new Set();
export const state = {
  status: 'idle',      // idle | syncing | offline | error
  pending: 0,
  lastSync: meta().lastSync ?? null,
  lastError: null,
  failed: meta().failed ?? [],
};

export const onSyncChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => { for (const fn of listeners) fn(state); };

function meta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY)) || {};
  } catch {
    return {};
  }
}
const saveMeta = () => localStorage.setItem(META_KEY, JSON.stringify({
  lastSync: state.lastSync, failed: state.failed.slice(-20),
}));

/* ---------------- fronta zmien (outbox) ---------------- */
function loadOutbox() {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY)) || [];
  } catch {
    return [];
  }
}
let outbox = loadOutbox();
const saveOutbox = () => {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  state.pending = outbox.length;
  emit();
};

/** Zaradí vloženie/úpravu riadku. Novšia zmena prepíše staršiu. */
export function queueUpsert(table, obj) {
  const row = MAPPERS[table].toRow(obj);
  if (row.id === null || row.id === undefined || row.id === '') {
    // Bez identifikátora by riadok databáza odmietla a zablokoval by frontu.
    console.error('Zmena bez identifikátora — neodosielam:', table, obj);
    state.lastError = 'Záznam bez identifikátora sa nepodarilo pripraviť na odoslanie.';
    emit();
    return;
  }
  const key = `${table}:${row.id}`;
  outbox = outbox.filter((o) => o.key !== key);
  outbox.push({ key, table, op: 'upsert', row, attempts: 0 });
  saveOutbox();
  schedulePush();
}

/** Zaradí zmazanie riadku. */
export function queueDelete(table, id) {
  const key = `${table}:${id}`;
  outbox = outbox.filter((o) => o.key !== key);
  outbox.push({ key, table, op: 'delete', row: { id }, attempts: 0 });
  saveOutbox();
  schedulePush();
}

/** Zmazanie viacerých riadkov naraz (napr. dochádzka zrušeného tréningu). */
export function queueDeleteMany(table, ids) {
  for (const id of ids) queueDelete(table, id);
}

export const pendingCount = () => outbox.length;

/** Zmeny čakajúce vo fronte, prevedené späť do podoby, akej rozumie appka.
    Používa sa pri sťahovaní zo servera, aby neodoslané záznamy nezmizli. */
export function pendingRows(table) {
  return outbox
    .filter((o) => o.table === table && o.op === 'upsert')
    .map((o) => MAPPERS[table].fromRow(o.row));
}
export function pendingDeletedIds(table) {
  return outbox.filter((o) => o.table === table && o.op === 'delete').map((o) => o.row.id);
}

/* ---------------- odoslanie na server ---------------- */
let pushTimer = null;
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { push().catch(() => {}); }, 800);
}

let inFlight = null;

export async function push() {
  if (!outbox.length) return true;
  if (inFlight) return inFlight;
  if (!navigator.onLine) {
    state.status = 'offline';
    emit();
    return false;
  }

  inFlight = (async () => {
    state.status = 'syncing';
    emit();

    const byTable = new Map();
    for (const op of outbox) {
      if (!byTable.has(op.table)) byTable.set(op.table, []);
      byTable.get(op.table).push(op);
    }

    const done = new Set();
    let hadFatal = false;

    for (const table of PUSH_ORDER) {
      const ops = byTable.get(table);
      if (!ops) continue;

      // najprv vloženia/úpravy (dávkovo), potom zmazania
      const upserts = ops.filter((o) => o.op === 'upsert');
      const deletes = ops.filter((o) => o.op === 'delete');

      if (upserts.length) {
        try {
          await upsertRows(table, upserts.map((o) => o.row), { onConflict: CONFLICT_KEYS[table] });
          upserts.forEach((o) => done.add(o.key));
        } catch (e) {
          if (isFatal(e)) { hadFatal = true; break; }

          // Databáza nepozná stĺpec = v Supabase chýba migrácia. Aby appka
          // neprestala fungovať, pošleme zmeny bez neho a povieme to nahlas.
          const chyba = chybajucaKolonka(e);
          let vyriesene = false;
          if (chyba) {
            state.lastError = `Databáza nepozná stĺpec „${chyba}" — spustite v Supabase najnovší SQL súbor `
              + 'z priečinka sql/. Zmeny sa zatiaľ ukladajú bez tohto údaja.';
            const orezane = upserts.map((o) => {
              const kopia = { ...o.row };
              delete kopia[chyba];
              return kopia;
            });
            try {
              await upsertRows(table, orezane, { onConflict: CONFLICT_KEYS[table] });
              upserts.forEach((o) => done.add(o.key));
              vyriesene = true;
              emit();
            } catch { /* nepomohlo — pokračujeme po jednom nižšie */ }
          }

          // dávka zlyhala — skúsime po jednom, nech neblokuje jeden chybný riadok
          if (!vyriesene) {
            for (const o of upserts) {
              try {
                await upsertRows(table, [o.row], { onConflict: CONFLICT_KEYS[table] });
                done.add(o.key);
              } catch (err) {
                if (isFatal(err)) { hadFatal = true; break; }
                markFailure(o, err);
                if (o.attempts >= MAX_ATTEMPTS) done.add(o.key);
              }
            }
            if (hadFatal) break;
          }
        }
      }

      for (const o of deletes) {
        try {
          await deleteRow(table, o.row.id);
          done.add(o.key);
        } catch (err) {
          if (isFatal(err)) { hadFatal = true; break; }
          markFailure(o, err);
          if (o.attempts >= MAX_ATTEMPTS) done.add(o.key);
        }
      }
      if (hadFatal) break;
    }

    outbox = outbox.filter((o) => !done.has(o.key));
    saveOutbox();

    if (hadFatal) {
      state.status = navigator.onLine ? 'error' : 'offline';
      emit();
      return false;
    }
    state.status = 'idle';
    state.lastError = null;
    emit();
    return outbox.length === 0;
  })().finally(() => { inFlight = null; });

  return inFlight;
}

/** Chyba, pri ktorej nemá zmysel pokračovať (offline, vypršané prihlásenie). */
function isFatal(e) {
  if (!(e instanceof ApiError)) return true;      // sieťová chyba
  return e.status === 401 || e.status === 403 || e.status === 429 || e.status >= 500;
}

function markFailure(op, err) {
  op.attempts = (op.attempts ?? 0) + 1;
  state.lastError = err.message;
  if (op.attempts >= MAX_ATTEMPTS) {
    // uložíme aj samotný riadok, aby sa dalo ukázať, o akú zmenu išlo,
    // a aby sa dala neskôr poslať znova
    state.failed.push({
      table: op.table,
      op: op.op,
      row: op.row,
      error: err.message,
      at: new Date().toISOString(),
    });
    saveMeta();
    console.error('Zmenu sa nepodarilo odoslať:', op, err);
  }
}

/** Zaradí späť do fronty už prevedený riadok (bez mapovania). */
function enqueueRaw(table, op, row) {
  const key = `${table}:${row.id}`;
  outbox = outbox.filter((o) => o.key !== key);
  outbox.push({ key, table, op, row, attempts: 0 });
}

/** Skúsi znova odoslať zmeny, ktoré predtým zlyhali. */
export async function retryFailed() {
  const items = state.failed;
  state.failed = [];
  saveMeta();
  for (const f of items) enqueueRaw(f.table, f.op ?? 'upsert', f.row ?? { id: f.id });
  saveOutbox();
  return push();
}

export function clearFailed() {
  state.failed = [];
  saveMeta();
  emit();
}

/** Z chyby databázy vytiahne názov chýbajúceho stĺpca (chýbajúca migrácia). */
function chybajucaKolonka(err) {
  const text = String(err?.details?.message || err?.message || '');
  const m = /Could not find the '([\w]+)' column/i.exec(text)
    || /column "?([\w]+)"? of relation .* does not exist/i.exec(text);
  return m ? m[1] : null;
}

/* ---------------- načítanie zo servera ---------------- */
/** Stiahne celú databázu klubu. Dáta sú malé, sťahujeme naraz. */
export async function pull() {
  state.status = 'syncing';
  emit();
  try {
    const [trainers, groups, students, sessions, attendance, payments, settings, schedule,
      events, eventResults] = await Promise.all([
      selectAll('trainers'),
      selectAll('groups'),
      selectAll('students'),
      selectAll('sessions'),
      selectAll('attendance'),
      selectAll('payments'),
      selectAll('club_settings'),
      // rozvrh je novšia tabuľka — ak ešte nie je založená, appka beží ďalej bez neho
      selectAll('schedule').catch(() => {
        state.lastError = 'Rozvrh zatiaľ nie je v databáze — spustite sql/07-rozvrh.sql.';
        return [];
      }),
      selectAll('events').catch(() => {
        state.lastError = 'Bodovanie zatiaľ nie je v databáze — spustite sql/08-bodovanie.sql.';
        return [];
      }),
      selectAll('event_results').catch(() => []),
    ]);

    const map = (table, rows) => (rows ?? []).map(MAPPERS[table].fromRow);
    const result = {
      trainers: map('trainers', trainers),
      groups: map('groups', groups),
      students: map('students', students),
      sessions: map('sessions', sessions),
      attendance: map('attendance', attendance),
      payments: map('payments', payments),
      schedule: map('schedule', schedule),
      events: map('events', events),
      eventResults: map('event_results', eventResults),
      settings: settings?.[0] ? MAPPERS.club_settings.fromRow(settings[0]) : null,
    };

    state.status = 'idle';
    state.lastSync = new Date().toISOString();
    state.lastError = null;
    saveMeta();
    emit();
    return result;
  } catch (e) {
    state.status = navigator.onLine ? 'error' : 'offline';
    state.lastError = e.message;
    emit();
    throw e;
  }
}

/** Odošle čakajúce zmeny a potom stiahne aktuálny stav.
    Sťahujeme aj vtedy, keď sa niečo odoslať nepodarilo — zmeny čakajúce
    vo fronte pri zlučovaní neprepíšeme (viď applyServerData v store.js).
    Inak by jediná zaseknutá zmena zablokovala celú appku. */
export async function syncNow() {
  await push().catch(() => {});
  return pull();
}

export function clearOutbox() {
  outbox = [];
  saveOutbox();
}

export function resetSyncState() {
  clearOutbox();
  state.failed = [];
  state.lastSync = null;
  localStorage.removeItem(META_KEY);
  emit();
}

/* ---------------- automatika ---------------- */
export function startAutoSync(onData) {
  const run = async () => {
    if (document.hidden) return;
    try {
      const data = await syncNow();
      if (data) onData(data);
    } catch { /* ticho — stav vidí používateľ v hlavičke */ }
  };

  setInterval(run, Math.max(15, CONFIG.syncIntervalSeconds) * 1000);
  window.addEventListener('online', () => { state.status = 'idle'; emit(); run(); });
  window.addEventListener('offline', () => { state.status = 'offline'; emit(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
  return run;
}

state.pending = outbox.length;
