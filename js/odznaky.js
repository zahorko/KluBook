/* =========================================================
   odznaky.js — hodnosti hráčov ako kreslené figúrky

   Level je číslo a číslo dieťa nenadchne. Hodnosť áno — je to
   tvar, ktorý spozná na prvý pohľad a vie, že ho niekto pred
   ním má lepší. Šesť figúrok pokrýva celých 35 levelov, takže
   postup na vyššiu hodnosť príde približne raz za pár mesiacov:
   dosť zriedka, aby to bola udalosť, dosť často, aby bolo na čo
   čakať.

   Kreslené sú ako SVG — jeden a ten istý súbor je ostrý na
   telefóne aj na premietačke a nič sa nesťahuje zo siete.
   ========================================================= */

/**
 * Hranice sú nastavené podľa toho, ako rýchlo sa v skutočnosti leveluje
 * pri jednom až dvoch tréningoch týždenne: Jazdec padne v prvých
 * mesiacoch, Strelec ku koncu prvej sezóny, Kráľ až po rokoch v klube.
 */
export const HODNOSTI = [
  { id: 'pesiak',  nazov: 'Pešiak',  od: 1,  farba: '#A9724A', svetla: '#F0E0D3' },
  { id: 'jazdec',  nazov: 'Jazdec',  od: 5,  farba: '#7C8B99', svetla: '#E2E7EB' },
  { id: 'strelec', nazov: 'Strelec', od: 10, farba: '#4E8C6A', svetla: '#DCEBE2' },
  { id: 'veza',    nazov: 'Veža',    od: 16, farba: '#4A6FA5', svetla: '#DEE6F1' },
  { id: 'dama',    nazov: 'Dáma',    od: 23, farba: '#7B5AA6', svetla: '#E7DFF1' },
  { id: 'kral',    nazov: 'Kráľ',    od: 30, farba: '#B8912B', svetla: '#F4E9C9' },
];

/* Siluety v mriežke 64×64. Všetky stoja na rovnakom podstavci,
   aby vedľa seba vyzerali ako jedna sada, nie ako náhodné obrázky. */
const PODSTAVEC = '<rect x="13" y="52" width="38" height="9" rx="4.5"/>';

const KRESBY = {
  pesiak: `
    <circle cx="32" cy="17" r="9"/>
    <rect x="20.5" y="26" width="23" height="6" rx="3"/>
    <path d="M24 33h16c0 9 3 15 7 18H17c4-3 7-9 7-18z"/>`,

  jazdec: `
    <path d="M42 5l3 10c4 7 6 16 6 25 0 5-1 9-1 12H21c0-6 1-11 4-15l3-4c-4 1-8 0-11-3-2-2-2-5 0-7l6-5 3-8c2-5 6-9 11-11z"/>
`,

  strelec: `
    <circle cx="32" cy="8" r="4"/>
    <path d="M32 12c7 5 11 11 11 17 0 5-5 9-11 9s-11-4-11-9c0-6 4-12 11-17z"/>
    <rect x="20.5" y="38" width="23" height="6" rx="3"/>
    <path d="M24 45h16c0 4 2 6 5 8H19c3-2 5-4 5-8z"/>`,

  veza: `
    <path d="M16 12h7v6h6v-6h6v6h6v-6h7v14l-5 5H21l-5-5z"/>
    <path d="M23.5 33h17l2.5 19H21z"/>`,

  dama: `
    <circle cx="12.5" cy="18" r="4.2"/>
    <circle cx="22" cy="12" r="4.2"/>
    <circle cx="32" cy="8.5" r="4.8"/>
    <circle cx="42" cy="12" r="4.2"/>
    <circle cx="51.5" cy="18" r="4.2"/>
    <path d="M12.5 20l5.5 17h28L51.5 20 47 26 42 14 37 26 32 11 27 26 22 14 17 26z"/>
    <rect x="16" y="38" width="32" height="6" rx="3"/>
    <path d="M20 45h24c0 4 2 6 5 8H15c3-2 5-4 5-8z"/>`,

  kral: `
    <path d="M28.5 3h7v5h5v6.5h-5V20h-7v-5.5h-5V8h5z"/>
    <path d="M32 22c8 0 14 5 14 11 0 4-2 6-4 8H22c-2-2-4-4-4-8 0-6 6-11 14-11z"/>
    <rect x="17" y="41" width="30" height="6" rx="3"/>
    <path d="M21 48h22c0 3 2 5 5 6H16c3-1 5-3 5-6z"/>`,
};

/* Zárez v strelcovom klobúku a jazdcovo oko — bez nich by obe figúrky
   boli len biele škvrny. Kreslia sa farbou pozadia, takže vyzerajú vyrezané. */
const ZAREZY = {
  strelec: '<path d="M30 16l9 9-3 3-9-9z"/>',
  jazdec: '<circle cx="37" cy="19" r="2.4"/>',
};

/** Ktorá hodnosť patrí danému levelu. */
export function hodnost(level) {
  const l = Number(level) || 1;
  let vysledok = HODNOSTI[0];
  for (const h of HODNOSTI) if (l >= h.od) vysledok = h;
  return vysledok;
}

/** Level, na ktorom sa hodnosť mení na vyššiu — null pri najvyššej. */
export function dalsiaHodnost(level) {
  const teraz = hodnost(level);
  const i = HODNOSTI.indexOf(teraz);
  return i < HODNOSTI.length - 1 ? HODNOSTI[i + 1] : null;
}

/** Hranice hodnosti nakrátko do dlaždice, napr. „10 – 15“ alebo „30+“. */
export function rozsahKratky(h) {
  const dalsia = HODNOSTI[HODNOSTI.indexOf(h) + 1];
  return dalsia ? `${h.od} – ${dalsia.od - 1}` : `${h.od}+`;
}

/** Hranice hodnosti ako text, napr. „levely 10 – 15“. */
export function rozsahHodnosti(h) {
  const i = HODNOSTI.indexOf(h);
  const dalsia = HODNOSTI[i + 1];
  return dalsia ? `levely ${h.od} – ${dalsia.od - 1}` : `level ${h.od} a vyššie`;
}

/**
 * Samotný odznak ako HTML reťazec.
 * @param {number} level
 * @param {{ velkost?: number, cislo?: boolean, ploche?: boolean }} nastavenia
 *   velkost — hrana v pixeloch; cislo — vpíše level do rožka;
 *   ploche — bez krúžku, len figúrka (do riadkov, kde by krúžok rušil).
 */
export function odznakHtml(level, { velkost = 44, cislo = false, ploche = false } = {}) {
  const h = hodnost(level);
  // v krúžku sa figúrka zmenší, aby sa podstavec nedotýkal okraja
  const mierka = ploche ? '' : ' transform="translate(7.04 7.04) scale(.78)"';
  const kresba = `<g${mierka}>`
    + `<g fill="${ploche ? h.farba : '#fff'}">${KRESBY[h.id]}${PODSTAVEC}</g>`
    + (ZAREZY[h.id] ? `<g fill="${ploche ? 'var(--white)' : h.farba}">${ZAREZY[h.id]}</g>` : '')
    + '</g>';

  const pozadie = ploche ? '' : `
    <circle cx="32" cy="32" r="31" fill="${h.farba}"/>
    <circle cx="32" cy="32" r="31" fill="none" stroke="rgba(0,0,0,.14)" stroke-width="2"/>`;

  const menovka = cislo
    ? `<g><circle cx="52" cy="52" r="13" fill="var(--white)" stroke="${h.farba}" stroke-width="2.5"/>`
      + `<text x="52" y="57.5" text-anchor="middle" font-size="15" font-weight="700"`
      + ` fill="${h.farba}" font-family="ui-sans-serif,system-ui,sans-serif">${level}</text></g>`
    : '';

  // viewBox sa rozšíri, len keď v rožku naozaj niečo je — inak by figúrka zbytočne zmenšela
  const box = cislo ? '0 0 66 66' : '0 0 64 64';
  return `<svg viewBox="${box}" width="${velkost}" height="${velkost}" role="img"`
    + ` aria-label="${h.nazov}, level ${level}">${pozadie}${kresba}${menovka}</svg>`;
}

/** To isté ako odznakHtml, len rovno ako prvok do stránky. */
export function odznakEl(level, { class: trieda = '', ...nastavenia } = {}) {
  const obal = document.createElement('span');
  obal.className = `odznak ${trieda}`.trim();
  obal.innerHTML = odznakHtml(level, nastavenia);
  return obal;
}
