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

export const CENA_TRENINGU_DEFAULT = 5;
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
  { id: 'grp_mie_on', name: 'Mierne pokročilí online', short: 'M online', order: 4 },
  { id: 'grp_pok_on', name: 'Pokročilí online', short: 'P online', order: 5 },
];

const DEFAULT_SETTINGS = {
  clubName: '1. Šachový klub Košice',
  shortName: '1. ŠK Košice',
  motto: 'Nie sme len šachový klub, sme komunita.',
  fee: CENA_TRENINGU_DEFAULT,
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
  schedule: [],
  events: [],
  eventResults: [],
  shopItems: [],
  purchases: [],
  absences: [],
  handovers: [],
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
  ['Michal Repka', 'grp_pok', '—', '0905 447 001', '2023-09-12', 'grp_pok_on'],
  ['Klára Sedláková', 'grp_pok', 'Roman Sedlák', '0918 220 774', '2023-09-12', 'grp_pok_on'],
  ['Oliver Bartoš', 'grp_pok', 'Silvia Bartošová', '0911 662 038', '2024-02-06'],
  ['Dominik Uhrín', 'grp_pok', '—', '0949 330 187', '2024-09-17'],
];

function seedDemo() {
  const d = emptyDb();
  d.demo = true;
  d.students = DEMO_STUDENTS.map(([name, groupId, contactName, contactPhone, startDate, extra]) => ({
    id: uid('stu'), name, groupId, groupIds: extra ? [groupId, extra] : [groupId],
    contactName, contactPhone,
    contactEmail: '', note: '', startDate, active: true,
  }));

  const plan = [
    { groupId: 'grp_zac', weekday: 2, start: '16:00', end: '17:30', trainerId: 'trn_lb' },
    { groupId: 'grp_mie', weekday: 4, start: '16:00', end: '17:30', trainerId: 'trn_jz' },
    { groupId: 'grp_pok', weekday: 4, start: '17:30', end: '19:00', trainerId: 'trn_jz' },
    { groupId: 'grp_pok', weekday: 1, start: '18:00', end: '19:30', trainerId: 'trn_jb' },
    { groupId: 'grp_pok_on', weekday: 3, start: '19:00', end: '20:00', trainerId: 'trn_jb' },
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
      for (const st of d.students.filter((x) => x.groupIds.includes(p.groupId) && x.startDate <= date)) {
        d.attendance.push({
          id: uid('att'), sessionId: s.id, studentId: st.id,
          present: Math.random() > 0.18, at: new Date(day).toISOString(),
        });
      }
    }
  }

  // demo rozvrh podľa toho istého plánu
  d.schedule = plan.map((p) => ({
    id: uid('sch'), groupId: p.groupId, weekday: p.weekday,
    startTime: p.start, endTime: p.end, trainerId: p.trainerId,
    active: true, skippedDates: [], createdAt: new Date().toISOString(),
  }));

  // v demo dátach je časť tréningov zaplatená, časť nie
  for (const a of d.attendance) {
    if (!a.present) continue;
    a.paid = Math.random() > 0.25;
    a.paidAmount = a.paid ? d.settings.fee : null;
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
        parsed.schedule ??= [];
        parsed.events ??= [];
        parsed.eventResults ??= [];
        parsed.shopItems ??= [];
        parsed.purchases ??= [];
        parsed.absences ??= [];
        parsed.handovers ??= [];
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
  if (data.schedule) db.schedule = zluc('schedule', data.schedule);
  if (data.events) db.events = zluc('events', data.events);
  if (data.eventResults) db.eventResults = zluc('event_results', data.eventResults);
  if (data.shopItems) db.shopItems = zluc('shop_items', data.shopItems);
  if (data.purchases) db.purchases = zluc('purchases', data.purchases);
  if (data.absences) db.absences = zluc('absences', data.absences);
  if (data.handovers) db.handovers = zluc('handovers', data.handovers);
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

/**
 * Stiahne dáta a pri neúspechu to chvíľu skúša znova.
 * Hneď po prihlásení môže byť token o zlomok sekundy „mladší" než hodiny
 * služby, ktorá ho overuje, a prvé stiahnutie zlyhá na „JWT issued at future".
 * O sekundu je už všetko v poriadku.
 */
async function pullSPokusmi(pokusov = 3) {
  for (let i = 0; i < pokusov; i++) {
    try {
      return await pull();
    } catch (e) {
      if (i === pokusov - 1) {
        console.warn('Prvé stiahnutie po prihlásení zlyhalo:', e.message);
        return null;
      }
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  return null;
}

/** Cloud: prihlásenie e-mailom a heslom. */
export async function signInWithPassword(email, password) {
  await api.signIn(email, password);
  // Prihlásenie už prebehlo. Ak sa dáta nestihnú stiahnuť, pustíme trénera
  // dnu aj tak — appka má lokálnu kópiu a automatická synchronizácia
  // dotiahne zvyšok. Zhodiť kvôli tomu celé prihlásenie by bolo zbytočné.
  const data = await pullSPokusmi();
  if (data) applyServerData(data);
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

/** Skupiny, do ktorých žiak patrí. Prvá je hlavná. */
export const studentGroupIds = (student) => {
  const zoznam = Array.isArray(student?.groupIds) && student.groupIds.length
    ? student.groupIds
    : [student?.groupId].filter(Boolean);
  return zoznam;
};
export const primaryGroupId = (student) => studentGroupIds(student)[0] ?? null;
export const studentGroupNames = (student) => studentGroupIds(student).map(groupName);
export const isInGroup = (student, groupId) => studentGroupIds(student).includes(groupId);

export function studentsOfGroup(groupId, { includeInactive = false } = {}) {
  return db.students
    .filter((s) => trainsWithClub(s) && isInGroup(s, groupId) && (includeInactive || s.active))
    .sort((a, b) => a.name.localeCompare(b.name, 'sk'));
}

/** Každý žiak práve raz — pre platby, kde je žiak jeden bez ohľadu na počet skupín. */
/** Všetci ľudia klubu vrátane tých, čo nechodia na tréningy (pre bodovanie). */
export function everyone({ includeInactive = false } = {}) {
  return db.students
    .filter((s) => includeInactive || s.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'sk'));
}

export const trainsWithClub = (student) => student?.trains !== false;

/** Žiaci, ktorí chodia na tréningy — pre platby a dochádzku. */
export function allStudents({ includeInactive = false } = {}) {
  return db.students
    .filter((s) => trainsWithClub(s))
    .filter((s) => includeInactive || s.active)
    .sort((a, b) => {
      const ga = groupById(primaryGroupId(a))?.order ?? 99;
      const gb = groupById(primaryGroupId(b))?.order ?? 99;
      return ga - gb || a.name.localeCompare(b.name, 'sk');
    });
}

/** Práve prebiehajúci tréning = dnešný, bez zapísaného konca. */
export const openSession = () =>
  db.sessions.find((s) => !s.endTime && s.date === todayISO()) ?? null;

/** Staršie tréningy, ktoré niekto zabudol ukončiť.
    Bez tohto rozlíšenia by včerajší neukončený tréning blokoval začatie nového. */
export const unfinishedSessions = () =>
  db.sessions
    .filter((s) => !s.endTime && s.date !== todayISO())
    .sort((a, b) => b.date.localeCompare(a.date));

export function sessionsInRange(from, to, { trainerId, groupId } = {}) {
  return db.sessions
    .filter((s) => s.date >= from && s.date <= to)
    .filter((s) => (trainerId ? s.trainerId === trainerId : true))
    .filter((s) => (groupId ? s.groupId === groupId : true))
    .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : b.date.localeCompare(a.date)));
}

export const attendanceOfSession = (sessionId) => db.attendance.filter((a) => a.sessionId === sessionId);

/**
 * Kto patrí do hárku dochádzky konkrétneho tréningu.
 *
 * Pri prebiehajúcom tréningu: aktuálna skupina plus ktokoľvek už zapísaný —
 * nech sa dá pridať aj žiak, ktorý práve dorazil.
 * Pri ukončenom tréningu: presne tí, čo sú v ňom zapísaní. Skupina sa totiž
 * časom mení a starý tréning musí ukazovať, kto na ňom naozaj bol — nie
 * to, kto je v skupine dnes.
 */
export function sessionRoster(session) {
  if (!session) return [];
  const zapisaneIds = new Set(
    db.attendance.filter((a) => a.sessionId === session.id).map((a) => a.studentId),
  );
  const zoznam = [...zapisaneIds].map(studentById).filter(Boolean);

  if (!session.endTime) {
    for (const s of studentsOfGroup(session.groupId)) {
      if (!zapisaneIds.has(s.id)) zoznam.push(s);
    }
  }
  return zoznam.sort((a, b) => a.name.localeCompare(b.name, 'sk'));
}

/**
 * Koho sa dá do hárku ešte doplniť, rozdelené po skupinách.
 * Pri päťdesiatich žiakoch je jeden dlhý zoznam nepoužiteľný — skupina
 * daného tréningu ide prvá, ostatné pod ňu.
 */
export function pridatelniDoTreningu(session) {
  const uzTam = new Set(sessionRoster(session).map((s) => s.id));
  const volni = allStudents({ includeInactive: true }).filter((s) => !uzTam.has(s.id));
  const podlaMena = (a, b) => a.name.localeCompare(b.name, 'sk');

  const sekcie = [];
  const pouzity = new Set();
  const pridaj = (nazov, ziaci, vlastna = false) => {
    if (ziaci.length) sekcie.push({ nazov, vlastna, ziaci: ziaci.sort(podlaMena) });
  };

  // skupina tohto tréningu ako prvá
  const zoSkupiny = volni.filter((s) => isInGroup(s, session.groupId));
  zoSkupiny.forEach((s) => pouzity.add(s.id));
  pridaj(groupName(session.groupId), zoSkupiny, true);

  for (const g of sortedGroups()) {
    if (g.id === session.groupId) continue;
    const ziaci = volni.filter((s) => !pouzity.has(s.id) && isInGroup(s, g.id));
    ziaci.forEach((s) => pouzity.add(s.id));
    pridaj(g.name, ziaci);
  }
  pridaj('Bez skupiny', volni.filter((s) => !pouzity.has(s.id)));

  return sekcie;
}

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

  const ospravedlneni = absencieNaDen(date);
  for (const s of studentsOfGroup(groupId)) {
    const rec = {
      id: uid('att'), sessionId: session.id, studentId: s.id,
      // kto sa vopred ospravedlnil, nezačína ako prítomný
      present: !ospravedlneni.has(s.id), at: new Date().toISOString(),
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

  const ospravedlneniRucne = absencieNaDen(date);
  for (const s of studentsOfGroup(groupId)) {
    if (s.startDate > date) continue;
    const rec = {
      id: uid('att'), sessionId: session.id, studentId: s.id,
      present: !ospravedlneniRucne.has(s.id), at: new Date().toISOString(),
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
  /* Kto nebol, neplatí — to je celý zmysel platby za tréning. Keby tu
     platba ostala visieť, súčty by ju prestali rátať (neprítomných
     preskakujú) a v evidencii by ticho zmizli peniaze, ktoré tréner
     naozaj dostal. Radšej ju zrušíme rovno, nech je stav jednoznačný. */
  if (!present && rec.paid) {
    rec.paid = false;
    rec.paidAmount = null;
  }
  sync.up('attendance', rec);
  save();
  return rec;
}

/**
 * Odobratie žiaka z dochádzky tréningu. Nie je to to isté ako označiť ho
 * za neprítomného — ten na tréningu byť mal, len neprišiel. Toto je pre
 * prípad, keď tam nemal čo hľadať (napr. omylom doplnený).
 */
export function removeAttendance(sessionId, studentId) {
  const rec = db.attendance.find((a) => a.sessionId === sessionId && a.studentId === studentId);
  if (!rec) return false;
  db.attendance = db.attendance.filter((a) => a.id !== rec.id);
  sync.del('attendance', rec.id);
  save();
  return true;
}

export function upsertStudent(data) {
  // POZOR: `id` vyberáme zvlášť. Formulár posiela pri novom žiakovi
  // `id: undefined` a keby sa dáta rozbalili cez vygenerované id,
  // prepísali by ho na prázdno — a taký záznam databáza odmietne.
  const { id, ...zvysok } = data;
  for (const k of Object.keys(zvysok)) {
    if (zvysok[k] === undefined) delete zvysok[k];
  }

  // groupId a groupIds musia vždy sedieť — groupId je hlavná skupina
  if (Array.isArray(zvysok.groupIds)) {
    zvysok.groupIds = [...new Set(zvysok.groupIds.filter(Boolean))]
      // Neexistujúcu skupinu zahodíme. Taký žiak by sa nezobrazil v žiadnom
      // zozname, ale do platieb by sa počítal — a čísla by nesedeli.
      .filter((gid) => !db.groups.length || db.groups.some((g) => g.id === gid));
    // aj keď je zoznam prázdny — inak by žiakovi ostala stará hlavná skupina
    zvysok.groupId = zvysok.groupIds[0] ?? null;
  } else if (zvysok.groupId) {
    zvysok.groupIds = [zvysok.groupId];
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

/**
 * Zabudnutie osobných údajov žiaka, ktorý už do klubu nechodí.
 * Zmazať ho celého by vzalo aj históriu tréningov a vybraté peniaze,
 * ktoré klub potrebuje na vyúčtovanie. Preto mu odoberieme meno a kontakt
 * a záznamy ostanú ako anonymné čiarky v štatistike.
 */
export function anonymizovatZiaka(studentId) {
  const s = studentById(studentId);
  if (!s) return null;
  const skratka = initialsOf(s.name) || '—';
  Object.assign(s, {
    name: `Bývalý žiak ${skratka}`,
    contactName: '', contactPhone: '', contactEmail: '', note: '',
    active: false, anonymized: true,
  });
  sync.up('students', s);
  // s menom ide preč aj ohlásená neúčasť — tá nesie dôvod, teda citlivý údaj
  const ids = absencie().filter((a) => a.studentId === studentId).map((a) => a.id);
  db.absences = db.absences.filter((a) => a.studentId !== studentId);
  sync.delMany('absences', ids);
  saveNow();
  return s;
}

export function deleteStudent(studentId) {
  const attIds = db.attendance.filter((a) => a.studentId === studentId).map((a) => a.id);
  db.students = db.students.filter((s) => s.id !== studentId);
  db.attendance = db.attendance.filter((a) => a.studentId !== studentId);
  sync.delMany('attendance', attIds);
  sync.del('students', studentId);
  save();
}


/* ---------- vopred ohlásené neúčasti ----------
   Rodič sa ozve v stredu, že dieťa vo štvrtok nepríde. Doteraz si to tréner
   musel pamätať do tréningu; teraz sa to zapíše a pri zakladaní tréningu sa
   dieťa rovno označí ako neprítomné. Platba sa mu tým pádom neúčtuje. */

export const absencie = () => db.absences ?? [];

/** Kto sa na daný deň ospravedlnil. */
export const absencieNaDen = (date) =>
  new Set(absencie().filter((a) => a.date === date).map((a) => a.studentId));

export const absenciaZiaka = (studentId, date) =>
  absencie().find((a) => a.studentId === studentId && a.date === date) ?? null;

/** Ospravedlnenia od dneška dopredu — to je to, čo trénera zaujíma. */
export function nadchadzajuceAbsencie(dni = 14) {
  const dnes = todayISO();
  const do_ = new Date(); do_.setDate(do_.getDate() + dni);
  const koniec = todayISO(do_);
  return absencie()
    .filter((a) => a.date >= dnes && a.date <= koniec)
    .map((a) => ({ ...a, student: studentById(a.studentId) }))
    .filter((a) => a.student)
    .sort((a, b) => a.date.localeCompare(b.date) || a.student.name.localeCompare(b.student.name, 'sk'));
}

export function ospravedlnit(studentId, date, note = '') {
  const uz = absenciaZiaka(studentId, date);
  const zaznam = uz ?? { id: uid('abs'), studentId, date, note: '', createdAt: new Date().toISOString() };
  zaznam.note = note;
  if (!uz) db.absences.push(zaznam);
  sync.up('absences', zaznam);

  // keď tréning na ten deň už existuje, prepíšeme aj dochádzku
  for (const t of db.sessions.filter((x) => x.date === date)) {
    if (attendanceRecord(t.id, studentId)) setAttendance(t.id, studentId, false);
  }
  save();
  return zaznam;
}

export function zrusitOspravedlnenie(studentId, date) {
  const z = absenciaZiaka(studentId, date);
  if (!z) return;
  db.absences = db.absences.filter((a) => a.id !== z.id);
  sync.del('absences', z.id);
  save();
}

/* ---------- žiaci, ktorí prestávajú chodiť ---------- */

/** Koľkokrát po sebe žiak chýbal (od posledného tréningu dozadu). */
export function absenceStreak(studentId) {
  const zaznamy = new Map(
    db.attendance.filter((a) => a.studentId === studentId).map((a) => [a.sessionId, a]),
  );
  if (!zaznamy.size) return { count: 0, lastPresent: null, lastAbsence: null, total: 0 };

  // len ukončené tréningy — v prebiehajúcom sú všetci predvolene prítomní
  const treningy = db.sessions
    .filter((s) => zaznamy.has(s.id) && s.endTime)
    .sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`));

  let count = 0;
  let lastPresent = null;
  let lastAbsence = null;
  for (const t of treningy) {
    if (zaznamy.get(t.id).present) { lastPresent = t.date; break; }
    if (!lastAbsence) lastAbsence = t.date;
    count++;
  }
  return { count, lastPresent, lastAbsence, total: treningy.length };
}

/** Od koľkých vymeškaní za sebou appka upozorní. */
export const ABSENCE_ALERT = 3;

/**
 * Žiaci, ktorí chýbali aspoň `hranica`-krát po sebe a ešte sa im nikto neozval.
 * Presne toto je chvíľa, keď má zmysel zavolať rodičom — kým dieťa neodíde nadobro.
 */
export function droppingStudents(hranica = ABSENCE_ALERT) {
  return db.students
    .filter((s) => s.active)
    .map((s) => ({ student: s, ...absenceStreak(s.id) }))
    .filter((x) => x.count >= hranica)
    .filter((x) => !x.student.contactedAt || x.student.contactedAt < x.lastAbsence)
    .sort((a, b) => b.count - a.count || a.student.name.localeCompare(b.student.name, 'sk'));
}

/** Zaznamená, že sa trénerom rodičom ozval — upozornenie zmizne do ďalšieho vymeškania. */
export function markContacted(studentId, date = todayISO()) {
  const s = studentById(studentId);
  if (!s) return;
  s.contactedAt = date;
  queueUpsert('students', s);
  saveNow();
}

/* ---------- klubové bodovanie za hranie ---------- */

/* Východiskové pravidlá. Dajú sa zmeniť v Nastaveniach, takže ich netreba
   trafiť napevno — po prvej sezóne sa doladia podľa skutočnosti. */
/* Čísla sú postavené voči XP za tréning (20 XP za hodinu), aby XP zodpovedalo
   tomu, koľko to dieťa naozaj stojí. Ligové kolo je pol dňa ≈ dva tréningy,
   celodenný turnaj s cestovaním ≈ päť tréningov. Bez toho by sa oplatilo
   len chodiť na tréningy a hrať by nemalo zmysel — čo je presne naopak,
   než na čo je toto bodovanie. */
export const DEFAULT_SCORING = {
  liga:   { ucast: 30, vyhra: 15, remiza: 8, prehra: 4, umiestnenie: {} },
  turnaj: { ucast: 60, vyhra: 10, remiza: 5, prehra: 2, umiestnenie: { 1: 120, 2: 80, 3: 50, 4: 30, 5: 30, 6: 30 } },
  ine:    { ucast: 30, vyhra: 15, remiza: 8, prehra: 4, umiestnenie: {} },
};

export const DRUHY_PODUJATI = {
  liga: 'Ligové kolo',
  turnaj: 'Turnaj',
  ine: 'Iné podujatie',
};

export function scoringRules() {
  const ulozene = db.settings.scoring ?? {};
  const out = {};
  for (const [kind, zaklad] of Object.entries(DEFAULT_SCORING)) {
    out[kind] = { ...zaklad, ...(ulozene[kind] ?? {}) };
    out[kind].umiestnenie = { ...zaklad.umiestnenie, ...(ulozene[kind]?.umiestnenie ?? {}) };
  }
  return out;
}

export function updateScoring(kind, patch) {
  const teraz = scoringRules();
  const nove = { ...teraz, [kind]: { ...teraz[kind], ...patch } };
  updateSettings({ scoring: nove });
}

/** Body za jeden výsledok — účasť + partie + umiestnenie + ručný bonus. */
export function computePoints(event, result) {
  const r = scoringRules()[event?.kind] ?? DEFAULT_SCORING.turnaj;
  const partie = (Number(result.wins) || 0) * r.vyhra
    + (Number(result.draws) || 0) * r.remiza
    + (Number(result.losses) || 0) * r.prehra;
  const umiestnenie = result.placement ? Number(r.umiestnenie?.[result.placement] ?? 0) : 0;
  const suma = r.ucast + partie + umiestnenie + (Number(result.bonus) || 0);
  return Math.round(suma * 100) / 100;
}

/* ---- sezóna ---- */
/** Šachový rok: 1. september až 31. august, ak si tréner neurčí inak. */
export function seasonRange() {
  const { seasonStart, seasonEnd } = db.settings;
  if (seasonStart && seasonEnd) return { from: seasonStart, to: seasonEnd };
  const d = new Date();
  const rok = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return { from: `${rok}-09-01`, to: `${rok + 1}-08-31` };
}

/* ---- dopyty ---- */
export const eventById = (id) => db.events.find((e) => e.id === id);
export const resultsOfEvent = (eventId) => db.eventResults.filter((r) => r.eventId === eventId);
export const resultsOfStudent = (studentId) => db.eventResults.filter((r) => r.studentId === studentId);

export function eventsInRange(from, to) {
  return db.events
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Rebríček za obdobie. Súčet všetkých bodov — kto hrá viac, má viac.
 * `groupId` je len filter zobrazenia, body sa počítajú vždy rovnako.
 */
export function leaderboard({ from, to, groupId = null } = {}) {
  const obdobie = from && to ? { from, to } : seasonRange();
  const podujatia = new Map(eventsInRange(obdobie.from, obdobie.to).map((e) => [e.id, e]));

  const podlaZiaka = new Map();
  for (const r of db.eventResults) {
    if (!podujatia.has(r.eventId)) continue;
    const zaznam = podlaZiaka.get(r.studentId) ?? {
      studentId: r.studentId, points: 0, events: 0, wins: 0, draws: 0, losses: 0, games: 0,
    };
    zaznam.points += Number(r.points) || 0;
    zaznam.events += 1;
    zaznam.wins += r.wins || 0;
    zaznam.draws += r.draws || 0;
    zaznam.losses += r.losses || 0;
    zaznam.games += (r.wins || 0) + (r.draws || 0) + (r.losses || 0);
    podlaZiaka.set(r.studentId, zaznam);
  }

  return [...podlaZiaka.values()]
    .map((z) => ({ ...z, student: studentById(z.studentId) }))
    .filter((z) => z.student)
    .filter((z) => (groupId ? isInGroup(z.student, groupId) : true))
    .sort((a, b) => b.points - a.points
      || b.events - a.events
      || a.student.name.localeCompare(b.student.name, 'sk'));
}

/** Podujatia jedného hráča aj s výsledkom — pre jeho kartu. */
export function studentEvents(studentId, obdobie = null) {
  const { from, to } = obdobie ?? seasonRange();
  return resultsOfStudent(studentId)
    .map((r) => ({ result: r, event: eventById(r.eventId) }))
    .filter((x) => x.event)
    .filter((x) => x.event.date >= from && x.event.date <= to)
    .sort((a, b) => b.event.date.localeCompare(a.event.date));
}

/** Súhrn za sezónu: koľko podujatí, koľko bodov, aká bilancia. */
export function studentPointsSummary(studentId, obdobie = null) {
  const zoznam = studentEvents(studentId, obdobie);
  return zoznam.reduce((acc, { result }) => ({
    events: acc.events + 1,
    points: Math.round((acc.points + (Number(result.points) || 0)) * 100) / 100,
    wins: acc.wins + (result.wins || 0),
    draws: acc.draws + (result.draws || 0),
    losses: acc.losses + (result.losses || 0),
  }), { events: 0, points: 0, wins: 0, draws: 0, losses: 0 });
}

/** Koľko podujatí má hráč mimo aktuálnej sezóny. */
export function studentEventsOutsideSeason(studentId) {
  const { from, to } = seasonRange();
  return resultsOfStudent(studentId)
    .map((r) => eventById(r.eventId))
    .filter((e) => e && (e.date < from || e.date > to)).length;
}

/* ---- zmeny ---- */
export function upsertEvent(data) {
  const { id, ...zvysok } = data;
  let e = id ? db.events.find((x) => x.id === id) : null;
  if (e) {
    Object.assign(e, zvysok);
  } else {
    e = { id: id || uid('evt'), createdAt: new Date().toISOString(), ...zvysok };
    db.events.push(e);
  }
  sync.up('events', e);
  save();
  return e;
}

export function deleteEvent(eventId) {
  const ids = resultsOfEvent(eventId).map((r) => r.id);
  db.eventResults = db.eventResults.filter((r) => r.eventId !== eventId);
  db.events = db.events.filter((e) => e.id !== eventId);
  sync.delMany('event_results', ids);
  sync.del('events', eventId);
  save();
}

/** Zapíše výsledok jedného hráča na podujatí a rovno prepočíta body. */
export function setEventResult(eventId, studentId, data = {}) {
  const event = eventById(eventId);
  let r = db.eventResults.find((x) => x.eventId === eventId && x.studentId === studentId);
  if (!r) {
    r = {
      id: uid('res'), eventId, studentId,
      wins: 0, draws: 0, losses: 0, placement: null, bonus: 0, points: 0, note: '',
    };
    db.eventResults.push(r);
  }
  Object.assign(r, data);
  r.points = computePoints(event, r);
  sync.up('event_results', r);
  save();
  return r;
}

export function removeEventResult(eventId, studentId) {
  const r = db.eventResults.find((x) => x.eventId === eventId && x.studentId === studentId);
  if (!r) return;
  db.eventResults = db.eventResults.filter((x) => x.id !== r.id);
  sync.del('event_results', r.id);
  save();
}

/** Prepočíta body všetkých výsledkov — po zmene pravidiel bodovania. */
export function recomputeAllPoints() {
  let zmenene = 0;
  for (const r of db.eventResults) {
    const nove = computePoints(eventById(r.eventId), r);
    if (nove !== r.points) {
      r.points = nove;
      sync.up('event_results', r);
      zmenene++;
    }
  }
  if (zmenene) saveNow();
  return zmenene;
}

/* =========================================================
   Gamifikácia — XP, levely, goldy a klubový obchod
   ---------------------------------------------------------
   XP a levely sa nikam neukladajú. Počítajú sa z podujatí a dochádzky,
   ktoré appka aj tak eviduje — takže sa nemôžu rozísť s realitou a po
   zmene pravidiel netreba nič prepočítavať.

   Level rastie naprieč rokmi z celkových XP (cesta v klube).
   Sezónne XP sa každý september vynulujú (preteky o tento rok).
   ========================================================= */

export const DEFAULT_GAMIFIKACIA = {
  xpZaTrening: 20,     // za každú prítomnosť na tréningu
  seriaDlzka: 5,       // koľko tréningov po sebe je séria
  seriaBonus: 50,      // XP navyše za každú dokončenú sériu
  levelZaklad: 60,     // XP na prvý level up
  levelKrok: 40,       // o koľko sa každý ďalší level predraží
  maxLevel: 35,
  goldZaLevel: 10,     // koľko goldov padne za jeden level up
};

export function gamifikacia() {
  return { ...DEFAULT_GAMIFIKACIA, ...(db.settings.gamification ?? {}) };
}

export const updateGamifikacia = (patch) =>
  updateSettings({ gamification: { ...gamifikacia(), ...patch } });

/** Koľko XP treba na postup z daného levelu na ďalší. */
export function xpNaDalsiLevel(level, g = gamifikacia()) {
  return g.levelZaklad + g.levelKrok * (level - 1);
}

/** Koľko XP treba nazbierať dovedna, aby človek dosiahol daný level. */
export function xpPreLevel(level, g = gamifikacia()) {
  let spolu = 0;
  for (let i = 1; i < level; i++) spolu += xpNaDalsiLevel(i, g);
  return spolu;
}

/** Z celkových XP spraví level aj postup k ďalšiemu — pre ukazovateľ. */
export function levelZoXp(xp, g = gamifikacia()) {
  let level = 1;
  let zaklad = 0;
  while (level < g.maxLevel) {
    const treba = xpNaDalsiLevel(level, g);
    if (xp < zaklad + treba) break;
    zaklad += treba;
    level += 1;
  }
  const doDalsieho = level >= g.maxLevel ? 0 : xpNaDalsiLevel(level, g);
  const vLeveli = xp - zaklad;
  return {
    level,
    vLeveli,
    doDalsieho,
    chyba: Math.max(0, doDalsieho - vLeveli),
    postup: doDalsieho ? Math.min(100, Math.round((vLeveli / doDalsieho) * 100)) : 100,
    maxDosiahnuty: level >= g.maxLevel,
  };
}

/**
 * XP všetkých naraz. Jeden prechod cez dochádzku a výsledky —
 * počítať to zvlášť pre každého žiaka by pri celej sezóne bolo pomalé.
 */
function xpTabulka({ from = null, to = null } = {}) {
  const g = gamifikacia();
  const vRozsahu = (d) => Boolean(d) && (!from || d >= from) && (!to || d <= to);
  const datumTreningu = new Map(db.sessions.map((t) => [t.id, t.date]));
  const datumPodujatia = new Map(db.events.map((e) => [e.id, e.date]));
  const out = new Map();
  const zaznam = (id) => {
    if (!out.has(id)) {
      out.set(id, {
        studentId: id, xp: 0, xpZTreningov: 0, xpZPodujati: 0, xpZoSerii: 0,
        treningy: 0, podujatia: 0, vyhry: 0, remizy: 0, prehry: 0,
        seria: 0, serie: 0,
      });
    }
    return out.get(id);
  };

  /* Dochádzku prechádzame po žiakoch a v poradí, lebo séria sa počíta
     z toho, čo šlo za sebou. Neukončené tréningy vynechávame — v nich sú
     predvolene všetci prítomní a séria by sa nafúkla, kým sa dochádzka
     naozaj nezapíše. */
  const ukoncene = new Set(db.sessions.filter((t) => t.endTime).map((t) => t.id));
  const poradieTreningu = new Map(db.sessions.map((t) => [t.id, `${t.date} ${t.startTime ?? ''}`]));
  const podlaZiaka = new Map();
  for (const a of db.attendance) {
    if (!ukoncene.has(a.sessionId) || !vRozsahu(datumTreningu.get(a.sessionId))) continue;
    if (!podlaZiaka.has(a.studentId)) podlaZiaka.set(a.studentId, []);
    podlaZiaka.get(a.studentId).push(a);
  }
  for (const [studentId, zoznam] of podlaZiaka) {
    zoznam.sort((x, y) => String(poradieTreningu.get(x.sessionId)).localeCompare(String(poradieTreningu.get(y.sessionId))));
    const z = zaznam(studentId);
    let vRade = 0;
    for (const a of zoznam) {
      if (!a.present) { vRade = 0; continue; }
      z.treningy += 1;
      vRade += 1;
      if (g.seriaDlzka > 0 && vRade % g.seriaDlzka === 0) z.serie += 1;
    }
    z.seria = vRade;   // koľko má práve teraz za sebou
  }
  for (const r of db.eventResults) {
    if (!vRozsahu(datumPodujatia.get(r.eventId))) continue;
    const z = zaznam(r.studentId);
    z.podujatia += 1;
    z.xpZPodujati += Number(r.points) || 0;
    z.vyhry += r.wins || 0;
    z.remizy += r.draws || 0;
    z.prehry += r.losses || 0;
  }
  for (const z of out.values()) {
    z.xpZTreningov = z.treningy * g.xpZaTrening;
    z.xpZoSerii = z.serie * g.seriaBonus;
    z.xp = Math.round(z.xpZTreningov + z.xpZoSerii + z.xpZPodujati);
  }
  return out;
}

const prazdnyZaznam = (studentId) => ({
  studentId, xp: 0, xpZTreningov: 0, xpZPodujati: 0, xpZoSerii: 0,
  treningy: 0, podujatia: 0, vyhry: 0, remizy: 0, prehry: 0,
  seria: 0, serie: 0,
});

/** Koľko goldov kto minul — jeden prechod cez nákupy. */
function minuteGoldy() {
  const out = new Map();
  for (const n of db.purchases ?? []) {
    out.set(n.studentId, (out.get(n.studentId) ?? 0) + (Number(n.price) || 0));
  }
  return out;
}

/** Goldy sa sypú za level up — kto je na leveli 5, dostal ich štyrikrát. */
export const goldZaLevel = (level, g = gamifikacia()) => Math.max(0, (level - 1) * g.goldZaLevel);

/**
 * Rebríček. `zoradenie` = 'sezona' (preteky o tento rok) alebo
 * 'celkovo' (dlhodobá cesta v klube).
 */
export function rebricek({ groupId = null, obdobie = null, zoradenie = 'sezona' } = {}) {
  const sezona = obdobie ?? seasonRange();
  const zaSezonu = xpTabulka(sezona);
  const zaVsetko = xpTabulka();
  const minute = minuteGoldy();

  const riadky = db.students
    .filter((s) => s.active)
    .filter((s) => (groupId ? isInGroup(s, groupId) : true))
    .map((s) => {
      const sez = zaSezonu.get(s.id) ?? prazdnyZaznam(s.id);
      const cel = zaVsetko.get(s.id) ?? prazdnyZaznam(s.id);
      const lvl = levelZoXp(cel.xp);
      const zarobene = goldZaLevel(lvl.level);
      const minul = minute.get(s.id) ?? 0;
      return {
        student: s, sezona: sez, celkovo: cel, ...lvl,
        goldZarobene: zarobene, goldMinute: minul, gold: zarobene - minul,
      };
    });

  const podlaMena = (a, b) => a.student.name.localeCompare(b.student.name, 'sk');
  riadky.sort(zoradenie === 'celkovo'
    ? (a, b) => b.level - a.level || b.celkovo.xp - a.celkovo.xp || podlaMena(a, b)
    : (a, b) => b.sezona.xp - a.sezona.xp || b.level - a.level || podlaMena(a, b));

  return riadky.map((r, i) => ({ ...r, poradie: i + 1 }));
}

/**
 * Level a séria jedného hráča. Lacnejšie než celý rebríček — používa sa
 * hneď po zápise dochádzky či výsledku, aby sa dal postup zachytiť
 * v okamihu, keď nastal. Inak by level ticho stúpol a nikto by si to
 * nevšimol, čo je pri odmene to najhoršie, čo sa môže stať.
 */
export function stavHraca(studentId) {
  const z = xpTabulka().get(studentId) ?? prazdnyZaznam(studentId);
  return { ...levelZoXp(z.xp), xp: z.xp, seria: z.seria, serie: z.serie };
}

/** Karta jedného hráča — to isté, len pre neho. */
export function hracskyProfil(studentId, obdobie = null) {
  return rebricek({ obdobie }).find((r) => r.student.id === studentId) ?? null;
}

/* ---- klubový obchod ---- */

/**
 * Odporúčaná ponuka na začiatok. Zámerne stúpa od drobností po veľké ceny —
 * dieťa musí mať čo kúpiť už po pár týždňoch, inak goldy nikoho neťahajú,
 * a zároveň niečo, na čo sa šetrí celú sezónu.
 */
export const ODPORUCANA_PONUKA = [
  { name: 'Sladké prekvapenie', description: 'keksík alebo čokoláda po tréningu', price: 10, kind: 'vec', ord: 1 },
  { name: 'Slané prekvapenie', description: 'chrumky alebo tyčinky po tréningu', price: 10, kind: 'vec', ord: 2 },
  { name: 'Vyber tému tréningu', description: 'na jeden tréning rozhoduješ ty', price: 25, kind: 'vyhoda', ord: 3 },
  { name: 'Prvý si vyberáš súpera', description: 'na najbližšom tréningu', price: 20, kind: 'vyhoda', ord: 4 },
  { name: 'Simultánka proti trénerovi', description: 'ty a spolužiaci proti mne', price: 40, kind: 'vyhoda', ord: 5 },
  { name: 'Klubová nálepka', description: 'na zošit, fľašu alebo mobil', price: 30, kind: 'vec', ord: 6 },
  { name: 'Šachová kniha', description: 'podľa tvojej úrovne', price: 90, kind: 'vec', ord: 7 },
  { name: 'Klubové tričko', description: 's logom 1. ŠK Košice', price: 120, kind: 'vec', ord: 8 },
  { name: 'Klub ti zaplatí štartovné', description: 'na turnaj podľa výberu', price: 150, kind: 'vec', ord: 9 },
  { name: 'Príspevok na sústredenie', description: 'klub prispeje na letné sústredenie', price: 250, kind: 'vec', ord: 10 },
];

export const shopItems = ({ includeInactive = false } = {}) =>
  (db.shopItems ?? [])
    .filter((i) => includeInactive || i.active !== false)
    .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0) || (a.price ?? 0) - (b.price ?? 0));

export function upsertShopItem(data) {
  const { id, ...zvysok } = data;
  let item = id ? db.shopItems.find((i) => i.id === id) : null;
  if (item) {
    Object.assign(item, zvysok);
  } else {
    item = {
      id: id || uid('itm'), name: '', description: '', price: 10, kind: 'vec',
      active: true, ord: (db.shopItems?.length ?? 0) + 1,
      createdAt: new Date().toISOString(), ...zvysok,
    };
    db.shopItems.push(item);
  }
  sync.up('shop_items', item);
  save();
  return item;
}

export function deleteShopItem(id) {
  db.shopItems = db.shopItems.filter((i) => i.id !== id);
  sync.del('shop_items', id);
  save();
}

export const purchasesOfStudent = (studentId) =>
  (db.purchases ?? [])
    .filter((n) => n.studentId === studentId)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));

/**
 * Nákup v obchode. Zámerne vracia chybu, keď na to hráč nemá —
 * inak by sa dal zostatok stlačiť pod nulu a goldy by stratili zmysel.
 */
export function kupit(studentId, itemId) {
  const item = (db.shopItems ?? []).find((i) => i.id === itemId);
  if (!item) throw new Error('Taká odmena už v ponuke nie je.');
  const profil = hracskyProfil(studentId);
  if (!profil) throw new Error('Žiak sa nenašiel.');
  const cena = Number(item.price) || 0;
  if (profil.gold < cena) {
    throw new Error(`Nemá dosť goldov — má ${profil.gold}, treba ${cena}.`);
  }
  const nakup = {
    id: uid('buy'), studentId, itemId: item.id, itemName: item.name,
    price: cena, at: new Date().toISOString(), delivered: false, note: '',
  };
  db.purchases.push(nakup);
  sync.up('purchases', nakup);
  save();
  return nakup;
}

/** Odmena odovzdaná do ruky — nech tréner vie, čo má ešte priniesť. */
export function oznacitOdovzdane(nakupId, delivered = true) {
  const n = db.purchases.find((x) => x.id === nakupId);
  if (!n) return null;
  n.delivered = delivered;
  sync.up('purchases', n);
  save();
  return n;
}

/** Vrátenie nákupu — goldy sa vrátia, lebo zostatok sa počíta z nákupov. */
export function zrusitNakup(nakupId) {
  db.purchases = db.purchases.filter((n) => n.id !== nakupId);
  sync.del('purchases', nakupId);
  save();
}

/** Odmeny, ktoré si deti vybrali, ale tréner ich ešte nedoniesol. */
export const nedorucneNakupy = () =>
  (db.purchases ?? [])
    .filter((n) => !n.delivered)
    .map((n) => ({ ...n, student: studentById(n.studentId) }))
    .filter((n) => n.student)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));

/* ---------- rozvrh tréningov ---------- */

export const DNI = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];

export const activeSchedule = () =>
  (db.schedule ?? [])
    .filter((r) => r.active !== false)
    .sort((a, b) => (a.weekday === b.weekday
      ? a.startTime.localeCompare(b.startTime)
      : ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7)));  // týždeň od pondelka

const minutyDna = (cas) => {
  const [h, m] = (cas || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Nájde tréning, ktorý zodpovedá konkrétnemu oknu rozvrhu.
 * Keď má skupina v ten deň jediné okno, stačí zhoda dátumu a skupiny.
 * Pri viacerých oknách (napr. online o 17:00 aj o 19:00) priradíme
 * každý zapísaný tréning k oknu s najbližším začiatkom — inak by jeden
 * zápis „prikryl" obe okná a to druhé by appka nikdy nepýtala.
 */
function sessionForSlot(date, slot) {
  const kandidati = db.sessions.filter((s) => s.date === date && s.groupId === slot.groupId);
  if (!kandidati.length) return null;

  const okna = (db.schedule ?? []).filter(
    (x) => x.active !== false && x.groupId === slot.groupId && x.weekday === slot.weekday,
  );
  if (okna.length <= 1) return kandidati[0];

  const najblizsieOkno = (trening) => okna.reduce((a, b) => (
    Math.abs(minutyDna(trening.startTime) - minutyDna(b.startTime))
      < Math.abs(minutyDna(trening.startTime) - minutyDna(a.startTime)) ? b : a
  ));
  return kandidati.find((t) => najblizsieOkno(t).id === slot.id) ?? null;
}

/** Dnešné položky rozvrhu aj s informáciou, či už sú zapísané. */
export function todaysSchedule() {
  const dnes = todayISO();
  const den = new Date().getDay();
  return activeSchedule()
    .filter((r) => r.weekday === den)
    .map((r) => ({ ...r, zapisany: Boolean(sessionForSlot(dnes, r)), date: dnes }));
}

/**
 * Tréningy, ktoré podľa rozvrhu mali byť, ale nie sú zapísané.
 * Dnešok vynechávame — ten sa ešte môže stihnúť.
 */
export function missingSessions(dniDozadu = 14) {
  const out = [];
  const dnes = new Date();
  for (const r of activeSchedule()) {
    for (let back = 1; back <= dniDozadu; back++) {
      const d = new Date(dnes);
      d.setDate(d.getDate() - back);
      if (d.getDay() !== r.weekday) continue;
      const date = todayISO(d);
      if (r.createdAt && date < todayISO(new Date(r.createdAt))) continue;
      if ((r.skippedDates ?? []).includes(date)) continue;
      if (sessionForSlot(date, r)) continue;
      out.push({ ...r, date });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function upsertScheduleEntry(data) {
  const { id, ...zvysok } = data;
  let zaznam = id ? db.schedule.find((r) => r.id === id) : null;
  if (zaznam) {
    Object.assign(zaznam, zvysok);
  } else {
    zaznam = {
      id: id || uid('sch'), active: true, skippedDates: [],
      createdAt: new Date().toISOString(), ...zvysok,
    };
    db.schedule.push(zaznam);
  }
  sync.up('schedule', zaznam);
  save();
  return zaznam;
}

export function deleteScheduleEntry(id) {
  db.schedule = db.schedule.filter((r) => r.id !== id);
  sync.del('schedule', id);
  save();
}

/** Zapamätá si, že v ten deň tréning výnimočne nebol (prázdniny, sviatok). */
export function markScheduleSkipped(scheduleId, date) {
  const r = db.schedule.find((x) => x.id === scheduleId);
  if (!r) return;
  r.skippedDates = [...new Set([...(r.skippedDates ?? []), date])];
  sync.up('schedule', r);
  save();
}

/* ---------- obdobia pre prehľady ---------- */

/** Od ktorého mesiaca má zmysel zobrazovať platby.
    Prednostne nastavenie klubu, inak najstaršia existujúca platba,
    inak aktuálny mesiac. Nikdy nezobrazujeme prázdnu minulosť. */
export function trackingSince() {
  if (db.settings.trackingSince) return db.settings.trackingSince;
  if (db.sessions.length) {
    return db.sessions.reduce((min, t) => (periodOf(t.date) < min ? periodOf(t.date) : min), periodOf(db.sessions[0].date));
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

/* ---------- platby za tréning ----------
   Platí sa za odtrénovanú hodinu, nie za mesiac. Preto záznam o platbe
   býva priamo pri dochádzke: jeden tréning, jeden žiak, jedno ťuknutie.
   Kto neprišiel, neplatí — nemá záznam, ktorý by sa dal odkliknúť. */

/** Cena jedného tréningu pre daného žiaka: vlastná, inak klubová. */
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

/** Záznam dochádzky = zároveň záznam platby za ten tréning. */
export const attendanceRecord = (sessionId, studentId) =>
  db.attendance.find((a) => a.sessionId === sessionId && a.studentId === studentId) ?? null;

export const jeZaplatene = (sessionId, studentId) =>
  Boolean(attendanceRecord(sessionId, studentId)?.paid);

/**
 * Zapíše, že žiak za tento tréning zaplatil (alebo to vezme späť).
 * Sumu ukladáme natvrdo — keď o rok zdvihnete cenu, staré tréningy
 * musia ostať zapísané za toľko, koľko sa vtedy naozaj vybralo.
 */
export function setTrainingPaid(sessionId, studentId, paid, suma = null) {
  const rec = attendanceRecord(sessionId, studentId);
  if (!rec) return null;
  rec.paid = Boolean(paid);
  rec.paidAmount = paid ? (suma ?? studentFee(studentId)) : null;
  // pri hotovosti je najdôležitejšie „kto" ten, kto peniaze prevzal
  rec.paidBy = paid ? (currentTrainer()?.id ?? null) : null;
  sync.up('attendance', rec);
  save();
  return rec;
}

export function toggleTrainingPaid(sessionId, studentId) {
  return setTrainingPaid(sessionId, studentId, !jeZaplatene(sessionId, studentId));
}

/** Koľko sa za tréning naozaj vybralo. */
export function vybraneZaTrening(sessionId) {
  let vybrane = 0;
  let chyba = 0;
  let zaplatili = 0;
  let mali = 0;
  for (const a of db.attendance) {
    if (a.sessionId !== sessionId || !a.present) continue;
    mali += 1;
    if (a.paid) { zaplatili += 1; vybrane += Number(a.paidAmount ?? studentFee(a.studentId)) || 0; }
    else chyba += studentFee(a.studentId);
  }
  return { vybrane, chyba, zaplatili, mali };
}

/**
 * Účet jedného žiaka: za koľko tréningov mal zaplatiť, koľko zaplatil
 * a koľko dlhuje. Berieme len tréningy, na ktorých naozaj bol.
 */
export function ucetZiaka(studentId, { from = null, to = null } = {}) {
  const datum = new Map(db.sessions.map((t) => [t.id, t.date]));
  const vRozsahu = (d) => Boolean(d) && (!from || d >= from) && (!to || d <= to);
  let treningov = 0;
  let zaplatenych = 0;
  let vybrane = 0;
  let dlh = 0;
  for (const a of db.attendance) {
    if (a.studentId !== studentId || !a.present || !vRozsahu(datum.get(a.sessionId))) continue;
    treningov += 1;
    if (a.paid) { zaplatenych += 1; vybrane += Number(a.paidAmount ?? studentFee(studentId)) || 0; }
    else dlh += studentFee(studentId);
  }
  return { treningov, zaplatenych, nezaplatenych: treningov - zaplatenych, vybrane, dlh };
}

/** Tréningy jedného žiaka aj so stavom platby — pre jeho kartu. */
export function platbyZiaka(studentId, { from = null, to = null } = {}) {
  return db.attendance
    .filter((a) => a.studentId === studentId && a.present)
    .map((a) => ({ zaznam: a, trening: db.sessions.find((t) => t.id === a.sessionId) }))
    .filter((x) => x.trening && (!from || x.trening.date >= from) && (!to || x.trening.date <= to))
    .sort((a, b) => b.trening.date.localeCompare(a.trening.date));
}

/** Kto dlhuje — zoradené od najväčšieho dlhu. */
export function dlznici({ from = null, to = null } = {}) {
  return allStudents()
    .map((s) => ({ student: s, ...ucetZiaka(s.id, { from, to }) }))
    .filter((x) => x.dlh > 0)
    .sort((a, b) => b.dlh - a.dlh || a.student.name.localeCompare(b.student.name, 'sk'));
}

/** Súhrn za obdobie — čo sa vybralo a čo chýba. */
export function pokladna({ from = null, to = null } = {}) {
  let vybrane = 0;
  let dlh = 0;
  let treningov = 0;
  let zaplatenych = 0;
  for (const s of allStudents()) {
    const u = ucetZiaka(s.id, { from, to });
    vybrane += u.vybrane; dlh += u.dlh;
    treningov += u.treningov; zaplatenych += u.zaplatenych;
  }
  return { vybrane, dlh, treningov, zaplatenych, nezaplatenych: treningov - zaplatenych };
}


/* ---------- klubová pokladňa ----------
   Peniaze vyberajú tréneri do vrecka a raz za čas ich odovzdajú do klubovej
   pokladne. Appka doteraz vedela len to, koľko sa malo vybrať. Tu sleduje,
   kto koľko prevzal a koľko z toho už odovzdal. */

export const odvody = () => db.handovers ?? [];

/** Kto platbu prevzal. Keď to appka nezaznamenala (staršie záznamy),
    pripíšeme ju trénerovi, ktorý ten tréning viedol. */
function prevzalPlatbu(zaznam, treningy) {
  return zaznam.paidBy ?? treningy.get(zaznam.sessionId)?.trainerId ?? null;
}

/**
 * Pokladňa po trénerovi: koľko prevzal, koľko odovzdal a koľko má u seba.
 * Bez tohto rozdielu sa hotovosť stráca ticho.
 */
export function pokladnaTrenerov({ from = null, to = null } = {}) {
  const treningy = new Map(db.sessions.map((t) => [t.id, t]));
  const vRozsahu = (d) => Boolean(d) && (!from || d >= from) && (!to || d <= to);

  const prevzate = new Map();
  for (const a of db.attendance) {
    if (!a.paid || !a.present) continue;
    const t = treningy.get(a.sessionId);
    if (!vRozsahu(t?.date)) continue;
    const kto = prevzalPlatbu(a, treningy);
    prevzate.set(kto, (prevzate.get(kto) ?? 0) + (Number(a.paidAmount ?? studentFee(a.studentId)) || 0));
  }

  const odovzdane = new Map();
  for (const o of odvody()) {
    if (!vRozsahu(o.at)) continue;
    odovzdane.set(o.trainerId, (odovzdane.get(o.trainerId) ?? 0) + (Number(o.amount) || 0));
  }

  const idcka = new Set([...prevzate.keys(), ...odovzdane.keys(), ...db.trainers.map((t) => t.id)]);
  return [...idcka]
    .map((id) => {
      const prevzal = Math.round((prevzate.get(id) ?? 0) * 100) / 100;
      const odovzdal = Math.round((odovzdane.get(id) ?? 0) * 100) / 100;
      return {
        trainerId: id,
        trainer: trainerById(id),
        meno: trainerById(id)?.name ?? 'Neznámy tréner',
        prevzal, odovzdal,
        uSeba: Math.round((prevzal - odovzdal) * 100) / 100,
      };
    })
    .filter((r) => r.prevzal || r.odovzdal)
    .sort((a, b) => b.uSeba - a.uSeba || a.meno.localeCompare(b.meno, 'sk'));
}

export function zapisatOdvod({ trainerId, amount, at = todayISO(), note = '' }) {
  const zaznam = {
    id: uid('odv'), trainerId, amount: Math.round((Number(amount) || 0) * 100) / 100,
    at, note, createdAt: new Date().toISOString(),
  };
  if (zaznam.amount <= 0) throw new Error('Suma musí byť väčšia ako nula.');
  db.handovers.push(zaznam);
  sync.up('handovers', zaznam);
  save();
  return zaznam;
}

export function zrusitOdvod(id) {
  db.handovers = db.handovers.filter((o) => o.id !== id);
  sync.del('handovers', id);
  save();
}

/** História odovzdaní, najnovšie hore. */
export const odvodyTrenera = (trainerId) =>
  odvody().filter((o) => o.trainerId === trainerId).sort((a, b) => b.at.localeCompare(a.at));

/* ---------- nastavenia klubu a tréneri ---------- */
export function updateSettings(patch) {
  Object.assign(db.settings, patch);
  sync.up('club_settings', db.settings);
  saveNow();
}

/**
 * Založí účet ďalšiemu trénerovi. Robí to server (appka na to nemá práva),
 * my si len po úspechu doplníme trénera do lokálnej kópie, nech ho vidno hneď.
 */
export async function pridatTrenera({ name, email, password }) {
  const vysledok = await api.callFunction('treneri', { name, email, password });
  if (vysledok?.id && !db.trainers.some((t) => t.id === vysledok.id)) {
    db.trainers.push({
      id: vysledok.id, name, initials: initialsOf(name), active: true,
      groupIds: [], createdAt: new Date().toISOString(),
    });
    saveNow();
  }
  return vysledok;
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
  // staršia záloha nemusí poznať novšie tabuľky — doplníme ich prázdne,
  // inak by appka spadla hneď pri prvom otvorení rozvrhu či podujatí
  parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
  parsed.groups = parsed.groups?.length ? parsed.groups : GROUPS;
  for (const k of ['trainers', 'sessions', 'attendance', 'schedule', 'events',
    'eventResults', 'shopItems', 'purchases', 'absences', 'handovers']) {
    if (!Array.isArray(parsed[k])) parsed[k] = [];
  }
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, parsed);
  saveNow();
  return parsed;
}

/**
 * Obnova zo zálohy v cloude. Samotné načítanie do zariadenia nestačí —
 * najbližšie sťahovanie zo servera by obnovené dáta prepísalo. Preto ich
 * celé postavíme do fronty na odoslanie, aby sa dostali späť aj na server.
 *
 * Trénerov posielame len tých, ktorých server už pozná: účty vznikajú
 * v Supabase, nie v zálohe, a neznámy tréner by sa odmietol aj s tréningami.
 */
export function importJSONToCloud(text) {
  const znamiTreneri = new Set(db.trainers.map((t) => t.id));
  importJSON(text);
  db.demo = false;

  const davky = [
    ['club_settings', [db.settings]],
    ['groups', db.groups],
    ['trainers', db.trainers.filter((t) => znamiTreneri.has(t.id))],
    ['students', db.students],
    ['sessions', db.sessions],
    ['attendance', db.attendance],
    ['schedule', db.schedule],
    ['events', db.events],
    ['event_results', db.eventResults],
    ['shop_items', db.shopItems],
    ['purchases', db.purchases],
    ['absences', db.absences],
    ['handovers', db.handovers],
  ];

  let pocet = 0;
  for (const [tabulka, riadky] of davky) {
    for (const r of riadky ?? []) { queueUpsert(tabulka, r); pocet++; }
  }
  saveNow();
  return { zaznamov: pocet, preskocenychTrenerov: db.trainers.length - db.trainers.filter((t) => znamiTreneri.has(t.id)).length };
}

export function resetAll() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(LEGACY_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function clearDemoData() {
  db.sessions = [];
  db.attendance = [];
  db.students = [];
  db.demo = false;
  saveNow();
}
