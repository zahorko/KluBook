/* =========================================================
   api.js — komunikácia so Supabase (bez knižníc, len fetch)
   ---------------------------------------------------------
   Rieši dve veci:
   1) prihlásenie (e-mail + heslo, obnova tokenu, odhlásenie)
   2) čítanie a zápis do databázy cez REST rozhranie

   Navyše „PIN trezor": po prihlásení heslom sa prihlasovací
   token zašifruje PIN-om a uloží do zariadenia. Ďalšie
   prihlásenie potom stačí PIN-om. Bez správneho PIN-u sa token
   nedá dešifrovať — nie je to len skrytý zámok.
   ========================================================= */
import { isCloud, apiKey, baseUrl } from './config.js';

const SESSION_KEY = 'klubook.session';
const VAULT_KEY = 'klubook.vault';
const MAX_PIN_TRIES = 5;

class ApiError extends Error {
  constructor(message, status, details, code = null) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code; // 'BAD_PIN' = zlý PIN, inak problém so serverom/prihlásením
  }
}
export { ApiError };

/* ---------------- session ---------------- */
export function session() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}
const storeSession = (data) => {
  const prev = session();
  const s = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    user: {
      id: data.user?.id ?? prev?.user?.id,
      email: data.user?.email ?? prev?.user?.email,
    },
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  // DÔLEŽITÉ: Supabase pri obnove vydá nový token a starý zneplatní.
  // Ak máme v pamäti kľúč od trezoru, hneď doň uložíme ten nový —
  // inak by v trezore ostal mŕtvy token a prihlásenie by po čase padlo.
  if (unlockedKey && s.refreshToken) {
    rewriteVault(s).catch((e) => console.warn('Trezor sa nepodarilo aktualizovať:', e));
  }
  return s;
};
export const clearSession = () => localStorage.removeItem(SESSION_KEY);
export const isSignedIn = () => Boolean(session()?.refreshToken);

/* ---------------- auth ---------------- */
async function authRequest(path, body) {
  const res = await fetch(`${baseUrl()}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: apiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(translateAuthError(data), res.status, data);
  }
  return data;
}

export async function signIn(email, password) {
  const data = await authRequest('token?grant_type=password', {
    email: email.trim().toLowerCase(),
    password,
  });
  const s = storeSession(data);
  markUnlocked();
  return s;
}

/* Obnova prihlásenia beží vždy len raz naraz.
   Sťahovanie spúšťa desať požiadaviek súčasne a bez tejto poistky by sa
   všetky pokúsili obnoviť token naraz. Supabase pri opakovanom použití
   toho istého obnovovacieho tokenu vyhodnotí pokus o zneužitie a zruší
   celé prihlásenie — tréner by vypadol a musel zadať heslo. */
let obnovaPrebieha = null;

export async function refreshSession() {
  if (obnovaPrebieha) return obnovaPrebieha;

  obnovaPrebieha = (async () => {
    const s = session();
    if (!s?.refreshToken) throw new ApiError('Nie ste prihlásený.', 401);
    const data = await authRequest('token?grant_type=refresh_token', { refresh_token: s.refreshToken });
    return storeSession(data);
  })().finally(() => { obnovaPrebieha = null; });

  return obnovaPrebieha;
}

export async function signOut() {
  const s = session();
  const email = s?.user?.email;
  if (s?.accessToken) {
    await fetch(`${baseUrl()}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: apiKey(),
        Authorization: `Bearer ${s.accessToken}`,
      },
    }).catch(() => {});
  }
  clearVault(email);   // najprv trezor — potrebuje e-mail zo session
  clearSession();
  localStorage.removeItem(UNLOCK_KEY);
  unlockedKey = null;
}

export async function changePassword(newPassword) {
  const token = await accessToken();
  const res = await fetch(`${baseUrl()}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: apiKey(),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(translateAuthError(data), res.status, data);
  }
}

/** Platný prístupový token; ak je starý, obnoví ho. */
export async function accessToken() {
  const s = session();
  if (!s) throw new ApiError('Nie ste prihlásený.', 401);
  if (Date.now() > s.expiresAt - 60_000) {
    return (await refreshSession()).accessToken;
  }
  return s.accessToken;
}

function translateAuthError(data) {
  const msg = String(data?.error_description || data?.msg || data?.message || '').toLowerCase();
  if (msg.includes('invalid api key')) {
    return 'Server neprijal kľúč z js/config.js. Najčastejšia príčina: kľúč je skopírovaný '
      + 'neúplne. V Supabase (Settings → API Keys) použite ikonu kopírovania vedľa '
      + 'Publishable key — text na obrazovke je skrátený.';
  }
  if (msg.includes('no api key')) return 'V js/config.js chýba kľúč (supabaseKey).';
  if (msg.includes('invalid login')) return 'Nesprávny e-mail alebo heslo.';
  if (msg.includes('email not confirmed')) return 'E-mail ešte nie je potvrdený.';
  if (msg.includes('refresh token')) return 'Prihlásenie vypršalo, prihláste sa znova heslom.';
  if (msg.includes('password should be')) return 'Heslo je príliš krátke (minimálne 6 znakov).';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Priveľa pokusov, skúste o chvíľu.';
  return data?.error_description || data?.msg || data?.message || 'Prihlásenie zlyhalo.';
}

/* ---------------- databáza (PostgREST) ---------------- */
async function restRequest(path, { method = 'GET', body, prefer, rozsah, sHlavickami } = {}) {
  const token = await accessToken();
  const headers = {
    apikey: apiKey(),
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  if (rozsah) headers.Range = `${rozsah[0]}-${rozsah[1]}`;

  const res = await fetch(`${baseUrl()}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 416 = pýtali sme riadky za koncom tabuľky, čiže už niet čo sťahovať.
  if (res.status === 416 && rozsah) return sHlavickami ? { data: [], hlavicka: '' } : [];

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(prelozChybuDatabazy(data, res.status), res.status, data);
  }
  if (res.status === 204) return sHlavickami ? { data: null, hlavicka: '' } : null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return sHlavickami ? { data, hlavicka: res.headers.get('Content-Range') || '' } : data;
}

/** Databázové hlášky, ktoré má zmysel ukázať trénerovi po slovensky. */
function prelozChybuDatabazy(data, status) {
  const text = String(data?.message || '');
  if (/issued at future|used before issued/i.test(text)) {
    return 'Hodiny servera sa o zlomok sekundy rozchádzajú. Skúste o chvíľu znova.';
  }
  if (/JWT expired/i.test(text)) return 'Prihlásenie vypršalo, prihláste sa znova.';
  return text || `Chyba databázy (${status})`;
}

/* Databáza pošle naraz najviac tisíc riadkov. Tabuľku preto sťahujeme
   po dávkach, kým nemáme všetky riadky, ktoré server hlási. Bez toho by
   sa pri väčšom počte žiakov či dochádzky časť údajov ticho stratila. */
const DAVKA = 1000;

export async function selectAll(table) {
  const vsetko = [];
  for (;;) {
    const od = vsetko.length;
    const { data, hlavicka } = await restRequest(`${table}?select=*&order=id.asc`, {
      prefer: 'count=exact',
      rozsah: [od, od + DAVKA - 1],
      sHlavickami: true,
    });
    const davka = Array.isArray(data) ? data : [];
    vsetko.push(...davka);
    if (!davka.length) break;

    // Hlavička vyzerá ako „0-999/1234" — za lomkou je celkový počet riadkov.
    const celkom = Number(String(hlavicka).split('/')[1]);
    if (Number.isFinite(celkom) ? vsetko.length >= celkom : davka.length < DAVKA) break;
  }
  return vsetko;
}

/** Vloží alebo prepíše riadky. `onConflict` = stĺpce, podľa ktorých
    sa pozná už existujúci záznam (inak primárny kľúč). */
export const upsertRows = (table, rows, { onConflict } = {}) =>
  restRequest(`${table}${onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : ''}`, {
    method: 'POST',
    body: Array.isArray(rows) ? rows : [rows],
    prefer: 'resolution=merge-duplicates,return=minimal',
  });

/**
 * Zavolá serverovú funkciu (Supabase Edge Function). Používa sa na to,
 * čo appka v telefóne robiť nesmie — napríklad zakladať účty, lebo na to
 * treba servisný kľúč, ktorý do telefónu nikdy nepatrí.
 */
export async function callFunction(name, body = {}) {
  const token = await accessToken();
  const res = await fetch(`${baseUrl()}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: apiKey(),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* prázdna odpoveď */ }
  if (!res.ok) throw new ApiError(data?.error || `Server odmietol požiadavku (${res.status})`, res.status, data);
  return data;
}

export const deleteRow = (table, id) =>
  restRequest(`${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });

/* ---------------- PIN trezor ---------------- */
/* Prihlasovací token sa zašifruje kľúčom odvodeným z PIN-u
   (PBKDF2 + AES-GCM). V zariadení teda neleží token čitateľne. */

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFromPin(pin, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/* Na jednom zariadení môže mať uložený PIN viac trénerov (klubový počítač).
   Trezory sú uložené pod e-mailom: { email: {salt, iv, data, userId, name, tries} } */
function vaults() {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(VAULT_KEY)) || {};
  } catch {
    raw = {};
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  // Staršia verzia ukladala jediný trezor ako {salt, iv, data, email, tries}.
  // Bez tohto upratania by sa jeho políčka tvárili ako mená trénerov.
  const clean = {};
  let zmenene = false;
  for (const [email, v] of Object.entries(raw)) {
    const platny = email.includes('@')
      && v && typeof v === 'object'
      && typeof v.salt === 'string'
      && typeof v.iv === 'string'
      && typeof v.data === 'string';
    if (platny) clean[email] = v;
    else zmenene = true;
  }
  if (zmenene) localStorage.setItem(VAULT_KEY, JSON.stringify(clean));
  return clean;
}
const saveVaults = (v) => localStorage.setItem(VAULT_KEY, JSON.stringify(v));

/** Zoznam účtov s uloženým PIN-om na tomto zariadení. */
export const vaultAccounts = () =>
  Object.entries(vaults()).map(([email, v]) => ({ email, name: v.name || email, initials: v.initials || '?' }));

export const hasVault = () => vaultAccounts().length > 0;

export function clearVault(email = session()?.user?.email) {
  const all = vaults();
  if (email) delete all[email];
  saveVaults(all);
  if (email === session()?.user?.email) unlockedKey = null;
}
export const clearAllVaults = () => { localStorage.removeItem(VAULT_KEY); unlockedKey = null; };

/* Kľúč odvodený z PIN-u držíme v pamäti, kým je appka otvorená.
   Vďaka tomu vieme do trezoru priebežne ukladať obnovené tokeny. */
let unlockedKey = null;
let unlockedSalt = null;

/** Prepíše trezor aktuálneho účtu novým tokenom (kľúč už máme v pamäti). */
async function rewriteVault(s) {
  if (!unlockedKey || !s?.refreshToken || !s.user?.email) return;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, unlockedKey, enc.encode(s.refreshToken));
  const all = vaults();
  const prev = all[s.user.email] ?? {};
  all[s.user.email] = {
    ...prev,
    salt: unlockedSalt,
    iv: b64(iv),
    data: b64(ct),
    userId: s.user.id ?? prev.userId,
    tries: 0,
  };
  saveVaults(all);
}

/** Uloží aktuálne prihlásenie pod PIN. */
export async function createVault(pin, { name = '', initials = '' } = {}) {
  const s = session();
  if (!s?.refreshToken) throw new ApiError('Nie ste prihlásený.', 401);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  unlockedKey = await keyFromPin(pin, salt);
  unlockedSalt = b64(salt);

  const all = vaults();
  all[s.user.email] = { ...(all[s.user.email] ?? {}), name, initials, userId: s.user.id, tries: 0 };
  saveVaults(all);

  await rewriteVault(s);
  markUnlocked();
}

/** Odomkne účet PIN-om. Funguje aj bez signálu. */
export async function openVault(email, pin) {
  const all = vaults();
  const v = all[email];
  if (!v) throw new ApiError('Pre tento účet nie je v zariadení uložený PIN.', 401);

  let refreshToken;
  let key;
  try {
    key = await keyFromPin(pin, unb64(v.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, key, unb64(v.data));
    refreshToken = dec.decode(plain);
  } catch {
    v.tries = (v.tries ?? 0) + 1;
    if (v.tries >= MAX_PIN_TRIES) {
      delete all[email];
      saveVaults(all);
      throw new ApiError('Priveľa nesprávnych pokusov. Prihláste sa e-mailom a heslom.', 401, null, 'BAD_PIN');
    }
    saveVaults(all);
    throw new ApiError(`Nesprávny PIN. Zostáva pokusov: ${MAX_PIN_TRIES - v.tries}`, 401, null, 'BAD_PIN');
  }

  // PIN sedel. Token zapíšeme ako prihlásenie a necháme ho obnoviť —
  // ak sme offline, appka beží ďalej z lokálnej kópie a obnoví sa neskôr.
  unlockedKey = key;
  unlockedSalt = v.salt;
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    accessToken: null,
    refreshToken,
    expiresAt: 0,
    user: { id: v.userId, email },
  }));
  markUnlocked();

  try {
    return await refreshSession();
  } catch (e) {
    if (e.status === 400 || e.status === 401) {
      delete all[email];
      saveVaults(all);
      clearSession();
      unlockedKey = null;
      throw new ApiError(
        'Prihlásenie vypršalo. Prihláste sa raz heslom a PIN si nastavte znova.',
        401, null, 'SESSION_EXPIRED',
      );
    }
    // sieťová chyba — pokračujeme offline s uloženým tokenom
    return session();
  }
}

/* ---------------- zámok ---------------- */
/* Po dlhšej nečinnosti (alebo po ručnom zamknutí) appka pýta PIN znova. */
const UNLOCK_KEY = 'klubook.unlockedAt';
const AUTO_LOCK_HOURS = 12;

const markUnlocked = () => localStorage.setItem(UNLOCK_KEY, String(Date.now()));

/** Zamkne appku: zmaže prihlásenie zo zariadenia, trezor s PIN-om ostáva. */
export function lock() {
  clearSession();
  localStorage.removeItem(UNLOCK_KEY);
  unlockedKey = null;
  unlockedSalt = null;
}

export function isLocked() {
  if (!hasVault()) return false;              // bez PIN-u sa rieši heslom
  if (!session()?.refreshToken) return true;  // nie je čím pokračovať
  const at = Number(localStorage.getItem(UNLOCK_KEY) || 0);
  return !at || Date.now() - at > AUTO_LOCK_HOURS * 3600 * 1000;
}

export const vaultEmail = () => session()?.user?.email ?? vaultAccounts()[0]?.email ?? '';

export { isCloud };
