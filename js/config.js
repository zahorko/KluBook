/* =========================================================
   config.js — JEDINÝ SÚBOR, KTORÝ UPRAVUJETE VY
   ---------------------------------------------------------
   Údaje nájdete v Supabase:
   Project Settings → API → Project URL a anon public key.

   Kým sú polia prázdne, appka beží v DEMO režime
   (dáta len v tomto zariadení, prihlásenie PIN 1234).
   Po vyplnení sa automaticky prepne na cloud:
   spoločná databáza + prihlásenie e-mailom a heslom.

   Poznámka: „anon key" je verejný kľúč, je v poriadku, že je
   v kóde — dáta chránia prístupové pravidlá v databáze (RLS),
   nie tento kľúč. Servisný kľúč (service_role) sem NIKDY nedávajte.
   ========================================================= */

export const CONFIG = {
  // Settings → Data API → Project URL
  // (alebo z adresy dashboardu: .../project/VAS-KOD/... → https://VAS-KOD.supabase.co)
  supabaseUrl: 'https://bjxliokrzqlwaqkanbil.supabase.co',

  // Settings → API Keys → Publishable key, začína 'sb_publishable_...'
  // Staršie projekty tu majú „anon public" kľúč začínajúci 'eyJ...' — funguje rovnako.
  // NIKDY sem nedávajte Secret key ('sb_secret_...') ani service_role.
  supabaseKey: 'sb_publishable_bzA2Ockd0EB0BfRq7mQ5lw_oFpijADf',

  // ako často sa appka pozrie na server, či niekto niečo zmenil (v sekundách)
  syncIntervalSeconds: 60,
};

/** Kľúč pre databázu. `supabaseAnonKey` podporujeme kvôli staršiemu názvu. */
export const apiKey = () => (CONFIG.supabaseKey || CONFIG.supabaseAnonKey || '').trim();

/** Adresa projektu bez lomítka na konci (inak by vznikali adresy s `//`). */
export const baseUrl = () => CONFIG.supabaseUrl.trim().replace(/\/+$/, '');

/**
 * Skontroluje najčastejšie preklepy v nastavení a vráti zrozumiteľné
 * vysvetlenie, alebo null, ak je všetko v poriadku.
 */
export function configProblem() {
  const url = baseUrl();
  const key = apiKey();
  if (!url && !key) return null; // demo režim, nič netreba

  if (!url) return 'V js/config.js chýba adresa projektu (supabaseUrl).';
  if (!key) return 'V js/config.js chýba kľúč (supabaseKey).';

  if (/…|\.\.\./.test(key)) {
    return 'Kľúč v js/config.js je skopírovaný len sčasti — končí bodkami, ktorými ho Supabase '
      + 'na obrazovke skracuje. Skopírujte ho ikonou kopírovania vedľa kľúča (Settings → API Keys).';
  }
  if (key.startsWith('sb_secret_') || key.includes('service_role')) {
    return 'V js/config.js je Secret key. Patrí tam Publishable key (sb_publishable_…) — '
      + 'secret kľúč obchádza bezpečnostné pravidlá a do appky nepatrí.';
  }
  if (/\s/.test(key)) return 'Kľúč obsahuje medzeru alebo zalomenie riadku — skopírujte ho znova.';
  if (!key.startsWith('sb_publishable_') && !key.startsWith('eyJ')) {
    return 'Kľúč nevyzerá ako Publishable key (sb_publishable_…) ani ako starší anon key (eyJ…).';
  }
  if (key.startsWith('sb_publishable_') && key.length < 30) {
    return 'Kľúč je príliš krátky, zrejme neúplný. Skopírujte ho ikonou kopírovania.';
  }
  if (/…|\.\.\./.test(url) || /\s/.test(CONFIG.supabaseUrl.trim())) {
    return 'Adresa projektu obsahuje bodky navyše alebo medzeru.';
  }
  if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url)) {
    return 'Adresa projektu má vyzerať ako https://vas-kod.supabase.co — bez cesty a lomítka na konci.';
  }
  return null;
}

/** True = appka je napojená na databázu. False = demo režim v zariadení. */
export const isCloud = () =>
  Boolean(CONFIG.supabaseUrl && CONFIG.supabaseUrl.startsWith('http') && apiKey());
