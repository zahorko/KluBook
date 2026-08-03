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
import { CONFIG, isCloud, apiKey } from './config.js';

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
  const s = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    user: { id: data.user?.id, email: data.user?.email },
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  return s;
};
export const clearSession = () => localStorage.removeItem(SESSION_KEY);
export const isSignedIn = () => Boolean(session()?.refreshToken);

/* ---------------- auth ---------------- */
async function authRequest(path, body) {
  const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/${path}`, {
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
  return storeSession(data);
}

export async function refreshSession() {
  const s = session();
  if (!s?.refreshToken) throw new ApiError('Nie ste prihlásený.', 401);
  const data = await authRequest('token?grant_type=refresh_token', { refresh_token: s.refreshToken });
  return storeSession(data);
}

export async function signOut() {
  const s = session();
  if (s?.accessToken) {
    await fetch(`${CONFIG.supabaseUrl}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: apiKey(),
        Authorization: `Bearer ${s.accessToken}`,
      },
    }).catch(() => {});
  }
  clearSession();
  clearVault();
}

export async function changePassword(newPassword) {
  const token = await accessToken();
  const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/user`, {
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
  if (msg.includes('invalid login')) return 'Nesprávny e-mail alebo heslo.';
  if (msg.includes('email not confirmed')) return 'E-mail ešte nie je potvrdený.';
  if (msg.includes('refresh token')) return 'Prihlásenie vypršalo, prihláste sa znova heslom.';
  if (msg.includes('password should be')) return 'Heslo je príliš krátke (minimálne 6 znakov).';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Priveľa pokusov, skúste o chvíľu.';
  return data?.error_description || data?.msg || data?.message || 'Prihlásenie zlyhalo.';
}

/* ---------------- databáza (PostgREST) ---------------- */
async function restRequest(path, { method = 'GET', body, prefer } = {}) {
  const token = await accessToken();
  const headers = {
    apikey: apiKey(),
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data?.message || `Chyba databázy (${res.status})`, res.status, data);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const selectAll = (table) => restRequest(`${table}?select=*`);

/** Vloží alebo prepíše riadky. `onConflict` = stĺpce, podľa ktorých
    sa pozná už existujúci záznam (inak primárny kľúč). */
export const upsertRows = (table, rows, { onConflict } = {}) =>
  restRequest(`${table}${onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : ''}`, {
    method: 'POST',
    body: Array.isArray(rows) ? rows : [rows],
    prefer: 'resolution=merge-duplicates,return=minimal',
  });

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

export function vault() {
  try {
    return JSON.parse(localStorage.getItem(VAULT_KEY)) || null;
  } catch {
    return null;
  }
}
export const hasVault = () => Boolean(vault());
export const clearVault = () => localStorage.removeItem(VAULT_KEY);

/** Uloží aktuálne prihlásenie pod PIN. */
export async function createVault(pin) {
  const s = session();
  if (!s?.refreshToken) throw new ApiError('Nie ste prihlásený.', 401);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPin(pin, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(s.refreshToken));
  localStorage.setItem(VAULT_KEY, JSON.stringify({
    salt: b64(salt),
    iv: b64(iv),
    data: b64(ct),
    email: s.user?.email ?? '',
    tries: 0,
  }));
}

/** Odomkne PIN-om a obnoví prihlásenie. Vracia session. */
export async function openVault(pin) {
  const v = vault();
  if (!v) throw new ApiError('V tomto zariadení nie je uložené prihlásenie.', 401);

  let refreshToken;
  try {
    const key = await keyFromPin(pin, unb64(v.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, key, unb64(v.data));
    refreshToken = dec.decode(plain);
  } catch {
    v.tries = (v.tries ?? 0) + 1;
    if (v.tries >= MAX_PIN_TRIES) {
      clearVault();
      throw new ApiError('Priveľa nesprávnych pokusov. Prihláste sa e-mailom a heslom.', 401, null, 'BAD_PIN');
    }
    localStorage.setItem(VAULT_KEY, JSON.stringify(v));
    throw new ApiError(`Nesprávny PIN. Zostáva pokusov: ${MAX_PIN_TRIES - v.tries}`, 401, null, 'BAD_PIN');
  }

  // PIN sedel — vymeníme uložený token za čerstvé prihlásenie.
  // Ak ho server odmietne (napr. vypršala platnosť), uložený PIN je
  // nepoužiteľný a tréner sa musí raz prihlásiť heslom.
  let data;
  try {
    data = await authRequest('token?grant_type=refresh_token', { refresh_token: refreshToken });
  } catch (e) {
    if (e.status === 400 || e.status === 401) {
      clearVault();
      throw new ApiError('Prihlásenie vypršalo. Prihláste sa raz heslom a PIN si nastavte znova.', 401, null, 'SESSION_EXPIRED');
    }
    throw e;
  }
  const s = storeSession(data);
  v.tries = 0;
  localStorage.setItem(VAULT_KEY, JSON.stringify(v));
  if (data.refresh_token && data.refresh_token !== refreshToken) await createVault(pin);
  return s;
}

export const vaultEmail = () => vault()?.email ?? '';

export { isCloud };
