/* =========================================================
   ikony.js — kreslené ikony appky

   Doteraz boli všade systémové emoji. Tie majú tri chyby: každý
   telefón ich kreslí inak, nesú si vlastné farby, ktoré s paletou
   klubu nesúvisia, a nedajú sa zafarbiť. Tieto sú kreslené v tom
   istom štýle ako odznaky hodností a preberajú farbu textu okolo
   seba — takže aktívna záložka v lište sčervenie sama.

   Kreslené v mriežke 24×24, plné tvary bez obrysov, zaoblené rohy.
   Výnimku majú goldy a medaily: tie si farbu nesú, lebo je to ich
   význam, nie ozdoba.
   ========================================================= */

const KRESBY = {
  /* ---- spodná lišta ---- */
  trening: `<circle cx="12" cy="5.8" r="3.4"/>
    <rect x="7.4" y="9.2" width="9.2" height="2.4" rx="1.2"/>
    <path d="M9 12.6h6c0 3.4 1.1 5.5 2.6 6.7H6.4C7.9 18.1 9 16 9 12.6z"/>
    <rect x="4.8" y="19.4" width="14.4" height="3" rx="1.5"/>`,

  ziaci: `<circle cx="9" cy="7.2" r="3.4"/>
    <circle cx="17.2" cy="8.4" r="2.7"/>
    <path d="M9 12.6c3.7 0 6.6 2.7 6.6 6.3 0 .8-.5 1.3-1.3 1.3H3.7c-.8 0-1.3-.5-1.3-1.3 0-3.6 2.9-6.3 6.6-6.3z"/>
    <path d="M17.2 12.9c2.8 0 4.9 2 4.9 4.8 0 .8-.5 1.2-1.2 1.2h-3.5c.1-2.5-.9-4.6-2.5-6 .7-.3 1.5-.4 2.3-.4z"/>`,

  rebricek: `<path d="M6.6 2.4h10.8v5.9c0 3-2.4 5.4-5.4 5.4S6.6 11.3 6.6 8.3V2.4z"/>
    <path d="M6.6 3.8H4.1c-.8 0-1.4.6-1.4 1.4 0 2.5 1.8 4.5 4.2 4.9V7.6C6 7.3 5.4 6.7 5.2 5.9h1.4V3.8z"/>
    <path d="M17.4 3.8h2.5c.8 0 1.4.6 1.4 1.4 0 2.5-1.8 4.5-4.2 4.9V7.6c.9-.3 1.5-.9 1.7-1.7h-1.4V3.8z"/>
    <rect x="10.6" y="13" width="2.8" height="3.6"/>
    <rect x="7.4" y="16.4" width="9.2" height="2.4" rx="1"/>
    <rect x="5.4" y="18.9" width="13.2" height="2.7" rx="1.35"/>`,

  platby: `<path fill-rule="evenodd" d="M4.4 4.4h15.2a2.8 2.8 0 0 1 2.8 2.8v9.6a2.8 2.8 0 0 1-2.8 2.8H4.4a2.8 2.8 0 0 1-2.8-2.8V7.2a2.8 2.8 0 0 1 2.8-2.8zM12 8.7a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6zM5.3 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zm13.4 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z"/>`,

  prehlady: `<rect x="2.6" y="12.4" width="4.8" height="9" rx="1.5"/>
    <rect x="9.6" y="7" width="4.8" height="14.4" rx="1.5"/>
    <rect x="16.6" y="2.6" width="4.8" height="18.8" rx="1.5"/>`,

  viac: `<path fill-rule="evenodd" d="M10.4 2.5a1.1 1.1 0 0 1 1.1-1h1a1.1 1.1 0 0 1 1.1 1l.2 1.7c.5.15 1 .36 1.45.63l1.35-1.05a1.1 1.1 0 0 1 1.45.1l.7.7a1.1 1.1 0 0 1 .1 1.45L18.75 7.4c.27.45.48.95.63 1.45l1.7.2a1.1 1.1 0 0 1 1 1.1v1a1.1 1.1 0 0 1-1 1.1l-1.7.2c-.15.5-.36 1-.63 1.45l1.05 1.35a1.1 1.1 0 0 1-.1 1.45l-.7.7a1.1 1.1 0 0 1-1.45.1L16.2 16.4c-.45.27-.95.48-1.45.63l-.2 1.7a1.1 1.1 0 0 1-1.1 1h-1a1.1 1.1 0 0 1-1.1-1l-.2-1.7c-.5-.15-1-.36-1.45-.63l-1.35 1.05a1.1 1.1 0 0 1-1.45-.1l-.7-.7a1.1 1.1 0 0 1-.1-1.45L5.25 13.9c-.27-.45-.48-.95-.63-1.45l-1.7-.2a1.1 1.1 0 0 1-1-1.1v-1a1.1 1.1 0 0 1 1-1.1l1.7-.2c.15-.5.36-1 .63-1.45L4.2 6.05a1.1 1.1 0 0 1 .1-1.45l.7-.7a1.1 1.1 0 0 1 1.45-.1L7.8 4.85c.45-.27.95-.48 1.45-.63l.2-1.72zM12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z"/>`,

  /* ---- význam ---- */
  seria: `<path fill-rule="evenodd" d="M12 1.6c.8 2.7.7 5.3-.7 7.4-.2-1.4.3-2.7 1.3-3.8.1 1.5 1 2.6 2 3.8 1.3 1.6 2.7 3.5 2.7 6.1a6.6 6.6 0 0 1-13.2 0c0-2.5 1.2-4.1 2.7-5.7C9.8 7.3 12 5.6 12 1.6zm0 12.2c-.1 1-.5 2-1.2 2.7-.7-.4-1.3-1.1-1.6-1.9-.9 1.5-2.6 2.6-2.6 4.7a3.7 3.7 0 0 0 7.4 0c0-2.5-.7-4-2-5.5z"/>`,

  darcek: `<path d="M7.4 1.6c1.9 0 3.4 2 4.6 5.4h-4.6a2.7 2.7 0 0 1 0-5.4zm9.2 0a2.7 2.7 0 0 1 0 5.4H12c1.2-3.4 2.7-5.4 4.6-5.4z"/>
    <path fill-rule="evenodd" d="M3.2 7.6h17.6a1.3 1.3 0 0 1 1.3 1.3v2a1.3 1.3 0 0 1-1.3 1.3h-.5v7.4a2.4 2.4 0 0 1-2.4 2.4H6.1a2.4 2.4 0 0 1-2.4-2.4v-7.4h-.5a1.3 1.3 0 0 1-1.3-1.3v-2a1.3 1.3 0 0 1 1.3-1.3zm7.6 0v14.4h2.4V7.6h-2.4z"/>`,

  vysada: `<path d="M12 1.8l3 6.1 6.7.98-4.85 4.72 1.15 6.68L12 17.1l-6 3.16 1.15-6.68L2.3 8.86 9 7.9z"/>`,

  kalendar: `<path fill-rule="evenodd" d="M7.4 1.6c.75 0 1.35.6 1.35 1.35V4h6.5V2.95a1.35 1.35 0 0 1 2.7 0V4h1.05A2.6 2.6 0 0 1 21.6 6.6v12.2a2.6 2.6 0 0 1-2.6 2.6H5a2.6 2.6 0 0 1-2.6-2.6V6.6A2.6 2.6 0 0 1 5 4h1.05V2.95c0-.75.6-1.35 1.35-1.35zM4.8 9.6v9.2h14.4V9.6H4.8z"/>
    <rect x="6.8" y="11.6" width="3" height="3" rx=".9"/>
    <rect x="14.2" y="11.6" width="3" height="3" rx=".9"/>`,

  oko: `<path fill-rule="evenodd" d="M12 4.4c-4.9 0-8.9 3.2-10.7 7.6 1.8 4.4 5.8 7.6 10.7 7.6s8.9-3.2 10.7-7.6C20.9 7.6 16.9 4.4 12 4.4zm0 11.9a4.3 4.3 0 1 1 0-8.6 4.3 4.3 0 0 1 0 8.6z"/>`,

  telefon: `<path d="M6.6 2.4c.9 0 1.7.5 2 1.4l1.3 3.2c.3.8.1 1.7-.6 2.2l-1.4 1.1a13 13 0 0 0 5.8 5.8l1.1-1.4c.5-.7 1.4-.9 2.2-.6l3.2 1.3c.9.3 1.4 1.1 1.4 2v2.4c0 1.3-1 2.3-2.3 2.3C10.3 22.1 1.9 13.7 1.9 4.7c0-1.3 1-2.3 2.3-2.3h2.4z"/>`,

  mail: `<path fill-rule="evenodd" d="M2.2 6.9A2.6 2.6 0 0 1 4.8 4.4h14.4a2.6 2.6 0 0 1 2.6 2.5L12 13.1 2.2 6.9zm0 2.7v7.5a2.6 2.6 0 0 0 2.6 2.6h14.4a2.6 2.6 0 0 0 2.6-2.6V9.6l-9.2 5.8a1.5 1.5 0 0 1-1.6 0L2.2 9.6z"/>`,

  sprava: `<path d="M12 2.6c5.6 0 10.1 3.7 10.1 8.3s-4.5 8.3-10.1 8.3c-.9 0-1.8-.1-2.6-.3l-4.7 2.3c-.6.3-1.3-.3-1.1-.9l1.2-3.6C3 15.2 1.9 13.2 1.9 10.9c0-4.6 4.5-8.3 10.1-8.3z"/>`,

  odkaz: `<path d="M10.2 13.8a4.6 4.6 0 0 1 0-6.5l3.3-3.3a4.6 4.6 0 0 1 6.5 6.5l-1.6 1.6a1.4 1.4 0 1 1-2-2l1.6-1.6a1.8 1.8 0 0 0-2.5-2.5l-3.3 3.3a1.8 1.8 0 0 0 0 2.5 1.4 1.4 0 1 1-2 2z"/>
    <path d="M13.8 10.2a4.6 4.6 0 0 1 0 6.5l-3.3 3.3a4.6 4.6 0 0 1-6.5-6.5l1.6-1.6a1.4 1.4 0 1 1 2 2l-1.6 1.6a1.8 1.8 0 0 0 2.5 2.5l3.3-3.3a1.8 1.8 0 0 0 0-2.5 1.4 1.4 0 1 1 2-2z"/>`,

  zamok: `<path fill-rule="evenodd" d="M12 1.6a5.4 5.4 0 0 0-5.4 5.4v2.4H5.8a2.4 2.4 0 0 0-2.4 2.4v8.2a2.4 2.4 0 0 0 2.4 2.4h12.4a2.4 2.4 0 0 0 2.4-2.4v-8.2a2.4 2.4 0 0 0-2.4-2.4h-.8V7A5.4 5.4 0 0 0 12 1.6zm2.8 7.8V7a2.8 2.8 0 1 0-5.6 0v2.4h5.6z"/>`,

  dokument: `<path d="M6.2 1.6h6.4v4.6a2.2 2.2 0 0 0 2.2 2.2h4.6v11.8a2.4 2.4 0 0 1-2.4 2.4H6.2a2.4 2.4 0 0 1-2.4-2.4V4a2.4 2.4 0 0 1 2.4-2.4z"/>
    <path d="M14.2 2.1l5 5h-4.3a.7.7 0 0 1-.7-.7V2.1z"/>`,

  kniha: `<path d="M3.4 3.4A2 2 0 0 1 5.4 1.4h5.4v18.4H5.4a2 2 0 0 0-2 2V3.4z"/>
    <path d="M20.6 3.4a2 2 0 0 0-2-2h-5.4v18.4h5.4a2 2 0 0 1 2 2V3.4z" opacity=".55"/>`,

  pozor: `<path fill-rule="evenodd" d="M10.3 3.1a2 2 0 0 1 3.4 0l8.1 14.3a2 2 0 0 1-1.7 3H3.9a2 2 0 0 1-1.7-3zM12 8.2c-.7 0-1.3.6-1.2 1.3l.3 4.4a.9.9 0 0 0 1.8 0l.3-4.4A1.2 1.2 0 0 0 12 8.2zm0 8a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"/>`,

  iskra: `<path d="M12 1.6l1.7 5.3 5.3 1.7-5.3 1.7L12 15.6l-1.7-5.3L5 8.6l5.3-1.7z"/>
    <path d="M18.6 14.4l.85 2.55 2.55.85-2.55.85-.85 2.55-.85-2.55-2.55-.85 2.55-.85z" opacity=".55"/>`,

  oslava: `<circle cx="12" cy="12" r="4.6"/>
    <g><rect x="10.9" y="0.8" width="2.2" height="4.3" rx="1.1"/>
    <rect x="10.9" y="18.9" width="2.2" height="4.3" rx="1.1"/>
    <rect x="0.8" y="10.9" width="4.3" height="2.2" rx="1.1"/>
    <rect x="18.9" y="10.9" width="4.3" height="2.2" rx="1.1"/></g>
    <g opacity=".62"><rect x="10.9" y="0.8" width="2.2" height="4.3" rx="1.1" transform="rotate(45 12 12)"/>
    <rect x="10.9" y="18.9" width="2.2" height="4.3" rx="1.1" transform="rotate(45 12 12)"/>
    <rect x="0.8" y="10.9" width="4.3" height="2.2" rx="1.1" transform="rotate(45 12 12)"/>
    <rect x="18.9" y="10.9" width="4.3" height="2.2" rx="1.1" transform="rotate(45 12 12)"/></g>`,
};

/* Goldy a medaily si nesú vlastnú farbu — to nie je ozdoba, ale význam. */
const FAREBNE = {
  gold: `<circle cx="12" cy="12" r="10.2" fill="#B8912B"/>
    <circle cx="12" cy="12" r="7.9" fill="#E6C65C"/>
    <g fill="#B8912B" transform="translate(12 12) scale(.42) translate(-12 -12)">
      <circle cx="12" cy="5.8" r="3.4"/>
      <rect x="7.4" y="9.2" width="9.2" height="2.4" rx="1.2"/>
      <path d="M9 12.6h6c0 3.4 1.1 5.5 2.6 6.7H6.4C7.9 18.1 9 16 9 12.6z"/>
      <rect x="4.8" y="19.4" width="14.4" height="3" rx="1.5"/>
    </g>`,
};

const MEDAILY = [
  { tmava: '#B8912B', svetla: '#E6C65C', stuha: '#C4573B' },
  { tmava: '#8B959C', svetla: '#C2CBD1', stuha: '#7C8B99' },
  { tmava: '#9C6238', svetla: '#C98C5C', stuha: '#A9724A' },
];

function medailaSvg(miesto) {
  const m = MEDAILY[miesto - 1] ?? MEDAILY[2];
  return `<path d="M6.6 1.4h4l3.1 7.4h-4z" fill="${m.stuha}"/>
    <path d="M13.4 1.4h4l-3.1 7.4h-4z" fill="${m.stuha}" opacity=".72"/>
    <circle cx="12" cy="15.6" r="7.4" fill="${m.tmava}"/>
    <circle cx="12" cy="15.6" r="5.6" fill="${m.svetla}"/>
    <text x="12" y="18.6" text-anchor="middle" font-size="7.4" font-weight="700"
      fill="${m.tmava}" font-family="ui-sans-serif,system-ui,sans-serif">${miesto}</text>`;
}

/**
 * Ikona ako HTML reťazec.
 * @param {string} nazov  kľúč z KRESBY, 'gold', alebo 'medaila1'…'medaila3'
 * @param {{ velkost?: number, popis?: string }} nastavenia
 *   popis — čo ikona znamená pre čítačku obrazovky; bez neho je ikona
 *   považovaná za ozdobu a čítačka ju preskočí (text vedľa nej to povie sám)
 */
export function ikonaHtml(nazov, { velkost = 24, popis = null } = {}) {
  const medaila = /^medaila([123])$/.exec(nazov);
  const telo = medaila ? medailaSvg(Number(medaila[1]))
    : FAREBNE[nazov] ?? (KRESBY[nazov] ? `<g fill="currentColor">${KRESBY[nazov]}</g>` : null);
  if (telo === null) return '';

  const pristupnost = popis
    ? ` role="img" aria-label="${popis}"`
    : ' aria-hidden="true" focusable="false"';
  return `<svg viewBox="0 0 24 24" width="${velkost}" height="${velkost}"`
    + ` fill="none"${pristupnost}>${telo}</svg>`;
}

/** To isté, len rovno ako prvok do stránky. */
export function ikona(nazov, { class: trieda = '', ...nastavenia } = {}) {
  const obal = document.createElement('span');
  obal.className = `ikona ${trieda}`.trim();
  obal.innerHTML = ikonaHtml(nazov, nastavenia);
  return obal;
}

/**
 * Číslo s mincou. Goldy sa v appke píšu na desiatkach miest a všade
 * majú vyzerať rovnako.
 */
export function goldy(pocet, { velkost = 15 } = {}) {
  const obal = document.createElement('span');
  obal.className = 'goldy';
  obal.append(String(pocet), ikona('gold', { velkost }));
  return obal;
}
