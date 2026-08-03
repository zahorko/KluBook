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
  supabaseKey: 'sb_publishable_bzA2Ockd0EB0BfRq7mQ5lw_oFpij...',

  // ako často sa appka pozrie na server, či niekto niečo zmenil (v sekundách)
  syncIntervalSeconds: 60,
};

/** Kľúč pre databázu. `supabaseAnonKey` podporujeme kvôli staršiemu názvu. */
export const apiKey = () => CONFIG.supabaseKey || CONFIG.supabaseAnonKey || '';

/** True = appka je napojená na databázu. False = demo režim v zariadení. */
export const isCloud = () =>
  Boolean(CONFIG.supabaseUrl && CONFIG.supabaseUrl.startsWith('http') && apiKey());
