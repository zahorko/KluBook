/* =========================================================
   store.js — dátová vrstva
   ---------------------------------------------------------
   Appka funguje v dvoch režimoch:

   • DEMO   — config.js nie je vyplnený. Dáta žijú len v tomto
              zariadení, prihlásenie PIN-om 1234.
   • CLOUD  — config.js vyplnený. Dáta sú v spoločnej databáze,
              lokálne sa drží kópia (kvôli rýchlosti a offline)
              a zmeny sa odosielajú cez sync.js.

   Obrazovky appky pracujú s dátami synchrónne (`db`), o server
   sa stará táto vrstva. Vďaka tomu bolo možné pridať cloud bez
   prepisovania obrazoviek.
   ========================================================= */
import { isCloud } from './config.js';
import * as api from './api.js';
import {
  queueUpsert, queueDelete, queueDeleteMany, pull, push, syncNow,
  pendingRows, pendingDeletedIds,
} from './sync.js';

const KEY = 'klubook.db.v1';
const LEGACY_KEY = '1skke.db.v1';
const SESSION_KEY = 'klubook.demo.session';

export const PERIOD_FEE_DEFAULT = 25;
export { isCloud };

/* ---------- pomocné ---------- */
export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const todayISO = (d = new Date()) => {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return t.toISOString().slice(0, 10);
};
export const nowHM = (d = new Date()) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const periodOf = (iso) => iso.slice(0, 7);

export const initialsOf = (name) =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

/* ---------- hashovanie PIN-u (len demo režim) ---------- */
export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}::${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const newSalt = () =>
  [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');

/* ---------- východiskové dáta ---------- */
const GROUPS = [
  { id: 'grp_zac', name: 'Začiatočníci', short: 'Z', order: 1 },
  { id: 'grp_mie', name: 'Mierne pokročilí', short: 'M', order: 2 },
  { id: 'grp_pok', name: 'Pokročilí', short: 'P', order: 3 },
];

const DEFAULT_SETTINGS = {
  clubName: '1. Šachový klub Košice',
  shortName: '1. ŠK Košice',
  motto: 'Nie sme len šachový klub, sme komunita.',
  fee: PERIOD_FEE_DEFAULT,
  // od ktorého mesiaca klub eviduje platby (prehľady nezobrazujú staršie)
  trackingSince: null,
};

const emptyDb = () => ({
  version: 2,
  createdAt: new Date().toISOString(),
  demo: false,
  settings: { ...DEFAULT_SETTINGS },
  trainers: [],
  groups: GROUPS,
  students: [],
  sessions: [],
  attendance: [],
  payments: [],
});

/* ---------- demo dáta ---------- */
const DEMO_STUDENTS = [
  ['Adam Kováč', 'grp_zac', 'Martina Kováčová', '0903 111 222', '2025-09-09'],
  ['Nina Hudáková', 'grp_zac', 'Peter Hudák', '0911 334 556', '2025-09-09'],
  ['Timotej Varga', 'grp_zac', 'Eva Vargová', '0918 774 010', '2025-10-07'],
  ['Sofia Baloghová', 'grp_zac', 'Zuzana Baloghová', '0905 220 118', '2026-01-13'],
  ['Marek Šimko', 'grp_zac', 'Ján Šimko', '0949 601 337', '2026-02-03'],
  ['Ela Fedorová', 'grp_mie', 'Katarína Fedorová', '0908 442 900', '2024-09-10'],
  ['Jakub Novák', 'grp_mie', 'Ivan Novák', '0902 887 314', '2024-09-10'],
  ['Lukáš Petrík', 'grp_mie', 'Andrea Petríková', '0917 553 208', '2025-01-14'],
  ['Viktória Tóthová', 'grp_mie', 'Miroslav Tóth', '0940 118 662', '2025-09-16'],
  ['Samuel Dzurko', 'grp_mie', 'Lenka Dzurková', '0903 909 445', '2025-11-04'],
  ['Michal Repka', 'grp_pok', '—', '0905 447 001', '2023-09-12'],
  ['Klára Sedláková', 'grp_pok', 'Roman Sedlák', '0918 220 774', '2023-09-12'],
  ['Oliver Bartoš', 'grp_pok', 'Silvia Bartošová', '0911 662 038', '2024-02-06'],
  ['Dominik Uhrín', 'grp_pok', '—', '0949 330 187', '2024-09-17'],
];

function seedDemo() {
  const d = emptyDb();
  d.demo = true;
  d.students = DEMO_STUDENTS.map(([name, groupId, contactName, contactPhone, startDate]) => ({
    id: uid('stu'), name, groupId, contactName, contactPhone,
    contactEmail: '', note: '', startDate, active: true,
  }));

  const plan = [
    { groupId: 'grp_zac', weekday: 2, start: '16:00', end: '17:30', trainerId: 'trn_lb' },
    { groupId: 'grp_mie', weekday: 4, start: '16:00', end: '17:30', trainerId: 'trn_jz' },
    { groupId: 'grp_pok', weekday: 4, start: '17:30', end: '19:00', trainerId: 'trn_jz' },
    { groupId: 'grp_pok', weekday: 1, start: '18:00', end: '19:30', trainerId: 'trn_jb' },
  ];
  const today = new Date();
  for (let back = 56; back >= 0; back--) {
    const day = new Date(today);
    day.setDate(day.getDate() - back);
    for (const p of plan) {
      if (p.weekday !== day.getDay()) continue;
      const date = todayISO(day);
      if (date === todayISO(today)) continue;
      const s = {
        id: uid('ses'), trainerId: p.trainerId, groupId: p.groupId, date,
        startTime: p.start, endTime: p.end, note: '', createdAt: new Date(day).toISOString(),
      };
      d.sessions.push(s);
      for (const st of d.students.filter((x) => x.groupId === p.groupId && x.startDate <= date)) {
        d.attendance.push({
          id: uid('att'), sessionId: s.id, studentId: st.id,
          present: Math.random() > 0.18, at: new Date(day).toISOString(),
        });
      }
    }
  }

  const months = [];
  for (let i = 2; i >= 0; i--) {
    const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  for (const st of d.students) {
    for (const period of months) {
      if (periodOf(st.startDate) > period) continue;
      const paid = period === months.at(-1) ? Math.random() > 0.35 : Math.random() > 0.1;
      d.payments.push({
        id: uid('pay'), studentId: st.id, period,
        status: paid ? 'paid' : 'unpaid',
        paidDate: paid ? `${period}-0${1 + Math.floor(Math.random() * 8)}` : null,
        amount: paid ? d.settings.fee : null, note: '',
      });
    }
  }
  return d;
}

/* ---------- načítanie / uloženie lokálnej kópie ---------- */
function load() {
  for (const key of [KEY, LEGACY_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed?.version) {
        parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
        return parsed;
      }
    } catch { /* poškodené dáta preskočíme */ }
  }
  return isCloud() ? emptyDb() : seedDemo();
}

export const db = load();

/**
 * Jednorazová oprava po chybe staršej verzie, ktorá vedela vytvoriť žiaka
 * bez identifikátora (taký záznam databáza odmietla). Žiakovi doplníme
 * identifikátor a priradíme mu osirené záznamy, ak sa to dá spoľahlivo určiť.
 */
function opravPoskodeneZaznamy() {
  const bezId = db.students.filter((s) => !s.id);
  if (!bezId.length) return { opraveni: 0, zahodene: 0 };

  for (const s of bezId) s.id = uid('stu');

  let zahodene = 0;
  const jedinyZiak = bezId.length === 1 ? bezId[0].id : null;

  const preved = (zoznam, kluc) => zoznam.filter((r) => {
    if (r[kluc]) return true;
    if (jedinyZiak) { r[kluc] = jedinyZiak; if (!r.id) r.id = uid('fix'); return true; }
    zahodene++;
    return false;
  });

  db.attendance = preved(db.attendance, 'studentId');
  db.payments = preved(db.payments, 'studentId');

  saveNow();
  console.warn(`KluBook: opravených ${bezId.length} žiakov bez identifikátora, zahodených ${zahodene} osirených záznamov.`);
  return { opraveni: bezId.length, zahodene };
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 60);
}
export function saveNow() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    console.error(e);
  }
}

/* Zápis je odložený o zlomok sekundy kvôli rýchlosti. Keď appku zavriete
   alebo prepnete na inú, uložíme okamžite — nech sa posledné ťuknutie
   nikdy nestratí. */
/* Oprava sa spúšťa až tu — potrebuje pripravené ukladanie. */
export const opravaPriStarte = opravPoskodeneZaznamy();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
}

/* ---------- štart ---------- */
/** Pripraví dáta. V cloude stiahne aktuálny stav zo servera. */
export async function initStore() {
  // opravené záznamy treba poslať na server, doteraz tam nikdy nedorazili
  if (isCloud() && opravaPriStarte.opraveni) {
    for (const s of db.students) queueUpsert('students', s);
    for (const t of db.sessions) queueUpsert('sessions', t);
    for (const a of db.attendance) queueUpsert('attendance', a);
    for (const p of db.payments) queueUpsert('payments', p);
  }

  if (!isCloud()) {
    await ensureDemoTrainers();
    return { mode: 'demo' };
  }
  if (!api.isSignedIn()) return { mode: 'cloud', signedIn: false };
  try {
    const data = await syncNow();
    if (data) applyServerData(data);
    return { mode: 'cloud', signedIn: true, synced: true };
  } catch (e) {
    // bez signálu pokračujeme s lokálnou kópiou
    console.warn('Synchronizácia pri štarte zlyhala:', e.message);
    return { mode: 'cloud', signedIn: true, synced: false, error: e.message };
  }
}

/** Prepíše lokálnu kópiu dátami zo servera.
    Záznamy, ktoré ešte čakajú vo fronte na odoslanie, ostávajú zachované —
    inak by trénerovi po synchronizácii zmizlo to, čo práve zapísal. */
export function applyServerData(data) {
  if (!data) return;

  const zluc = (tabulka, zoServera) => {
    const cakajuce = pendingRows(tabulka);
    if (!cakajuce.length) return zoServera;
    const podlaId = new Map(zoServera.map((r) => [r.id, r]));
    for (const r of cakajuce) podlaId.set(r.id, r);
    const zmazane = new Set(pendingDeletedIds(tabulka));
    return [...podlaId.values()].filter((r) => !zmazane.has(r.id));
  };

  db.trainers = data.trainers;
  db.groups = data.groups?.length ? data.groups : GROUPS;
  db.students = zluc('students', data.students);
  db.sessions = zluc('sessions', data.sessions);
  db.attendance = zluc('attendance', data.attendance);
  db.payments = zluc('payments', data.payments);
  if (data.settings) db.settings = { ...DEFAULT_SETTINGS, ...data.settings };
  db.demo = false;
  saveNow();
}

export async function refreshFromServer() {
  const data = await pull();
  applyServerData(data);
  return data;
}
export { push as pushChanges, syncNow };

/* ---------- prihlásenie ---------- */
export function currentTrainer() {
  if (isCloud()) {
    const s = api.session();
    if (!s?.user?.id) return null;
    const t = db.trainers.find((x) => x.id === s.user.id);
    if (t) return t;
    // účet existuje, ale nie je zapísaný medzi trénerov
    return { id: s.user.id, name: s.user.email ?? 'Tréner', initials: '?', active: true, unlinked: true };
  }
  const id = localStorage.getItem(SESSION_KEY);
  return db.trainers.find((t) => t.id === id && t.active) ?? null;
}

/** Cloud: prihlásenie e-mailom a heslom. */
export async function signInWithPassword(email, password) {
  await api.signIn(email, password);
  const data = await pull();
  applyServerData(data);
  return currentTrainer();
}

/** Cloud: rýchle odomknutie PIN-om uloženým v tomto zariadení. */
export async function unlockWithPin(email, pin) {
  await api.openVault(email, pin);
  try {
    const data = await syncNow();
    if (data) applyServerData(data);
  } catch { /* offline — pokračujeme s lokálnou kópiou */ }
  return currentTrainer();
}

export const setDevicePin = (pin, profil = {}) => api.createVault(pin, profil);
export const hasDevicePin = () => api.hasVault();
export const devicePinAccounts = () => api.vaultAccounts();
export const devicePinEmail = () => api.vaultEmail();
export const forgetDevicePin = (email) => api.clearVault(email);

/** Zamkne appku — vráti na PIN, prihlásenie ostáva uložené pod PIN-om. */
export function lockApp() {
  api.lock();
}
export const isLocked = () => isCloud() && api.isLocked();

export async function logout() {
  if (isCloud()) {
    await api.signOut().catch(() => {});
    for (const k of Object.keys(db)) {
      if (Array.isArray(db[k])) db[k] = [];
    }
    saveNow();
    return;
  }
  localStorage.removeItem(SESSION_KEY);
}

/* ---------- demo prihlásenie ---------- */
export async function ensureDemoTrainers() {
  if (db.trainers.length) return;
  const defaults = [
    { id: 'trn_jz', name: 'Jakub Zahorček' },
    { id: 'trn_lb', name: 'Lenka Bidulská' },
    { id: 'trn_jb', name: 'Jakub Bielik' },
  ];
  for (const t of defaults) {
    const salt = newSalt();
    db.trainers.push({
      id: t.id, name: t.name, initials: initialsOf(t.name),
      salt, pinHash: await hashPin('1234', salt),
      groupIds: [], active: true, createdAt: new Date().toISOString(),
    });
  }
  saveNow();
}

export async function demoLogin(trainerId, pin) {
  const t = db.trainers.find((x) => x.id === trainerId && x.active);
  if (!t) return false;
  if ((await hashPin(pin, t.salt)) !== t.pinHash) return false;
  localStorage.setItem(SESSION_KEY, t.id);
  return true;
}

export async function setDemoPin(trainerId, pin) {
  const t = db.trainers.find((x) => x.id === trainerId);
  if (!t) return;
  t.salt = newSalt();
  t.pinHash = await hashPin(pin, t.salt);
  saveNow();
}

/* ---------- dopyty ---------- */
export const groupById = (id) => db.groups.find((g) => g.id === id);
export const groupName = (id) => groupById(id)?.name ?? '—';
export const trainerById = (id) => db.trainers.find((t) => t.id === id);
export const trainerName = (id) => trainerById(id)?.name ?? '—';
export const studentById = (id) => db.students.find((s) => s.id === id);

export const sortedGroups = () => [...db.groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export function studentsOfGroup(groupId, { includeInactive = false } = {}) {
  return db.students
    .filter((s) => s.groupId === groupId && (includeInactive || s.active))
    .sort((a, b) => a.name.localeCompare(b.name, 'sk'));
}

export const openSession = () => db.sessions.find((s) => !s.endTime) ?? null;

export function sessionsInRange(from, to, { trainerId, groupId } = {}) {
  return db.sessions
    .filter((s) => s.date >= from && s.date <= to)
    .filter((s) => (trainerId ? s.trainerId === trainerId : true))
    .filter((s) => (groupId ? s.groupId === groupId : true))
    .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : b.date.localeCompare(a.date)));
}

export const attendanceOfSession = (sessionId) => db.attendance.filter((a) => a.sessionId === sessionId);

export function durationMinutes(session) {
  if (!session.endTime) return 0;
  const [h1, m1] = session.startTime.split(':').map(Number);
  const [h2, m2] = session.endTime.split(':').map(Number);
  return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
}

/* ---------- zmeny (lokálne + do fronty na server) ---------- */
const sync = {
  up: (table, obj) => { if (isCloud()) queueUpsert(table, obj); },
  del: (table, id) => { if (isCloud()) queueDelete(table, id); },
  delMany: (table, ids) => { if (isCloud()) queueDeleteMany(table, ids); },
};

export function startSession({ trainerId, groupId, date = todayISO(), startTime = nowHM() }) {
  const session = {
    id: uid('ses'), trainerId, groupId, date, startTime, endTime: null,
    note: '', createdAt: new Date().toISOString(),
  };
  db.sessions.push(session);
  sync.up('sessions', session);

  for (const s of studentsOfGroup(groupId)) {
    const rec = {
      id: uid('att'), sessionId: session.id, studentId: s.id,
      present: true, at: new Date().toISOString(),
    };
    db.attendance.push(rec);
    sync.up('attendance', rec);
  }
  save();
  return session;
}

export function endSession(sessionId, endTime = nowHM()) {
  const s = db.sessions.find((x) => x.id === sessionId);
  if (!s) return null;
  s.endTime = endTime;
  sync.up('sessions', s);
  save();
  return s;
}

export function addManualSession({ trainerId, groupId, date, startTime, endTime, note = '' }) {
  const session = {
    id: uid('ses'), trainerId, groupId, date, startTime, endTime, note,
    createdAt: new Date().toISOString(),
  };
  db.sessions.push(session);
  sync.up('sessions', session);

  for (const s of studentsOfGroup(groupId)) {
    if (s.startDate > date) continue;
    const rec = {
      id: uid('att'), sessionId: session.id, studentId: s.id,
      present: true, at: new Date().toISOString(),
    };
    db.attendance.push(rec);
    sync.up('attendance', rec);
  }
  save();
  return session;
}

export function updateSession(session) {
  sync.up('sessions', session);
  saveNow();
}

export function deleteSession(sessionId) {
  const attIds = db.attendance.filter((a) => a.sessionId === sessionId).map((a) => a.id);
  db.sessions = db.sessions.filter((s) => s.id !== sessionId);
  db.attendance = db.attendance.filter((a) => a.sessionId !== sessionId);
  sync.delMany('attendance', attIds);
  sync.del('sessions', sessionId);
  save();
}

export function setAttendance(sessionId, studentId, present) {
  let rec = db.attendance.find((a) => a.sessionId === sessionId && a.studentId === studentId);
  if (!rec) {
    rec = { id: uid('att'), sessionId, studentId, present, at: new Date().toISOString() };
    db.attendance.push(rec);
  } else {
    rec.present = present;
    rec.at = new Date().toISOString();
  }
  sync.up('attendance', rec);
  save();
  return rec;
}

export function upsertStudent(data) {
  // POZOR: `id` vyberáme zvlášť. Formulár posiela pri novom žiakovi
  // `id: undefined` a keby sa dáta rozbalili cez vygenerované id,
  // prepísali by ho na prázdno — a taký záznam databáza odmietne.
  const { id, ...zvysok } = data;
  for (const k of Object.keys(zvysok)) {
    if (zvysok[k] === undefined) delete zvysok[k];
  }

  let student = id ? db.students.find((x) => x.id === id) : null;
  if (student) {
    Object.assign(student, zvysok);
  } else {
    student = {
      id: id || uid('stu'),
      active: true,
      contactName: '', contactPhone: '', contactEmail: '', note: '',
      monthlyFee: null, startDate: todayISO(),
      ...zvysok,
    };
    db.students.push(student);
  }
  sync.up('students', student);
  save();
  return student;
}

export function updateStudent(student) {
  sync.up('students', student);
  saveNow();
}

export function deleteStudent(studentId) {
  const attIds = db.attendance.filter((a) => a.studentId === studentId).map((a) => a.id);
  const payIds = db.payments.filter((p) => p.studentId === studentId).map((p) => p.id);
  db.students = db.students.filter((s) => s.id !== studentId);
  db.attendance = db.attendance.filter((a) => a.studentId !== studentId);
  db.payments = db.payments.filter((p) => p.studentId !== studentId);
  sync.delMany('attendance', attIds);
  sync.delMany('payments', payIds);
  sync.del('students', studentId);
  save();
}

/* ---------- platby ---------- */
export const paymentFor = (studentId, period) =>
  db.payments.find((p) => p.studentId === studentId && p.period === period) ?? null;

export const paymentStatus = (studentId, period) => paymentFor(studentId, period)?.status ?? 'unpaid';

/* ---------- obdobia pre prehľady ---------- */

/** Od ktorého mesiaca má zmysel zobrazovať platby.
    Prednostne nastavenie klubu, inak najstaršia existujúca platba,
    inak aktuálny mesiac. Nikdy nezobrazujeme prázdnu minulosť. */
export function trackingSince() {
  if (db.settings.trackingSince) return db.settings.trackingSince;
  if (db.payments.length) {
    return db.payments.reduce((min, p) => (p.period < min ? p.period : min), db.payments[0].period);
  }
  return periodOf(todayISO());
}

/** Zoznam mesiacov od `from` po aktuálny (vrátane), najviac `max` posledných. */
export function periodsUpToNow(from = trackingSince(), max = 18) {
  const teraz = periodOf(todayISO());
  const out = [];
  let [y, m] = from.split('-').map(Number);
  if (!y || !m) return [teraz];
  for (let i = 0; i < 240; i++) {
    const p = `${y}-${String(m).padStart(2, '0')}`;
    out.push(p);
    if (p >= teraz) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out.slice(-max);
}

/** Očakávaný mesačný poplatok žiaka: vlastný, inak klubový. */
export function studentFee(student) {
  const s = typeof student === 'string' ? studentById(student) : student;
  const vlastny = s?.monthlyFee;
  if (vlastny === null || vlastny === undefined || vlastny === '') return Number(db.settings.fee) || 0;
  return Number(vlastny) || 0;
}
export const hasOwnFee = (student) => {
  const s = typeof student === 'string' ? studentById(student) : student;
  return s?.monthlyFee !== null && s?.monthlyFee !== undefined && s?.monthlyFee !== '';
};

/** Skutočne zaplatená suma za mesiac (0, ak nezaplatené). */
export function paidAmount(studentId, period) {
  const p = paymentFor(studentId, period);
  if (!p || p.status !== 'paid') return 0;
  return p.amount === null || p.amount === undefined ? studentFee(studentId) : Number(p.amount) || 0;
}

export function setPayment(studentId, period, status, { amount = null, paidDate = null, note = '' } = {}) {
  let p = paymentFor(studentId, period);
  if (!p) {
    p = { id: uid('pay'), studentId, period, status, paidDate, amount, note };
    db.payments.push(p);
  } else {
    p.status = status;
    p.paidDate = paidDate;
    p.amount = amount;
    if (note) p.note = note;
  }
  sync.up('payments', p);
  save();
  return p;
}

export function togglePayment(studentId, period) {
  const next = paymentStatus(studentId, period) === 'paid' ? 'unpaid' : 'paid';
  return setPayment(studentId, period, next, {
    amount: next === 'paid' ? studentFee(studentId) : null,
    paidDate: next === 'paid' ? todayISO() : null,
  });
}

/* ---------- nastavenia klubu a tréneri ---------- */
export function updateSettings(patch) {
  Object.assign(db.settings, patch);
  sync.up('club_settings', db.settings);
  saveNow();
}

export function updateTrainer(trainer) {
  sync.up('trainers', trainer);
  saveNow();
}

/* ---------- záloha ---------- */
export const exportJSON = () => JSON.stringify(db, null, 2);

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed?.version || !Array.isArray(parsed.students)) throw new Error('Neplatný súbor zálohy.');
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, parsed);
  saveNow();
}

export function resetAll() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(LEGACY_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function clearDemoData() {
  db.sessions = [];
  db.attendance = [];
  db.payments = [];
  db.students = [];
  db.demo = false;
  saveNow();
}
