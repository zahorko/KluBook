/* =========================================================
   ui.js — malé UI pomôcky (bez frameworku)
   ========================================================= */
import { ikona } from './ikony.js';

/** el('div.card', { onclick }, ...children) */
export function el(spec, props = {}, ...children) {
  const [tagPart, ...classes] = String(spec).split('.');
  const node = document.createElement(tagPart || 'div');
  if (classes.length) node.className = classes.join(' ');

  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = `${node.className} ${v}`.trim();
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') nastavStyl(node, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') node[k] = !!v;
    else node.setAttribute(k, v);
  }
  append(node, children);
  return node;
}

/* Object.assign na style nevie zapísať vlastné CSS premenné (--nieco) —
   tie musia ísť cez setProperty, inak sa ticho zahodia. */
function nastavStyl(node, styl) {
  for (const [k, v] of Object.entries(styl)) {
    if (k.startsWith('--')) node.style.setProperty(k, v);
    else node.style[k] = v;
  }
}

function append(node, children) {
  for (const c of children.flat(4)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
};

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Vyprázdni uzol a vloží deti — na rozdiel od node.append() rozbalí polia. */
export function mount(node, ...children) {
  clear(node);
  append(node, children);
  return node;
}

/* ---------- formátovanie dátumov ---------- */
const DAYS = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
const DAYS_SHORT = ['ne', 'po', 'ut', 'st', 'št', 'pi', 'so'];
const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december'];

export const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const fmtDate = (iso) => {
  const d = parseISO(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
};
export const fmtDateLong = (iso) => {
  const d = parseISO(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
export const fmtDayShort = (iso) => {
  const d = parseISO(iso);
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;
};
export const fmtPeriod = (period) => {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
export const fmtPeriodShort = (period) => {
  const [, m] = period.split('-').map(Number);
  return MONTHS[m - 1].slice(0, 3);
};
export const fmtHours = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};

export function monthList(count = 12, endPeriod = null) {
  const now = endPeriod ? new Date(+endPeriod.split('-')[0], +endPeriod.split('-')[1] - 1, 1) : new Date();
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
export const shiftPeriod = (period, delta) => {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/* ---------- toast ---------- */
let toastTimer = null;
export function toast(message, { oslava = false, ikona: menoIkony = null } = {}) {
  const node = document.getElementById('toast');
  node.textContent = message;
  // oslava má vždy ikonu — bez nej je postup na vyšší level len ďalšia hláška
  const ktora = menoIkony ?? (oslava ? 'oslava' : null);
  if (ktora) node.prepend(ikona(ktora, { velkost: 18 }));
  node.classList.toggle('toast--oslava', oslava);
  node.classList.add('toast--on');
  clearTimeout(toastTimer);
  // level up nech chvíľu postojí — tréner to má stihnúť prečítať deťom
  toastTimer = setTimeout(() => node.classList.remove('toast--on'), oslava ? 4200 : 2200);
}

/* ---------- sheet (modal zdola) ---------- */
export function sheet(title, buildBody) {
  const root = document.getElementById('modal-root');
  const close = () => {
    clear(root);
    document.body.style.overflow = '';
  };
  const body = el('div.stack');
  const panel = el('div.sheet', {},
    el('div.sheet__grip'),
    el('h2.sheet__title', { text: title }),
    body,
  );
  const scrim = el('div.scrim', {
    onclick: (e) => { if (e.target === scrim) close(); },
  }, panel);

  mount(root, scrim);
  document.body.style.overflow = 'hidden';
  buildBody(body, close);
  return close;
}

export function confirmSheet(title, message, { danger = false, okLabel = 'Potvrdiť' } = {}) {
  return new Promise((resolve) => {
    sheet(title, (body, close) => {
      body.append(
        el('p.muted', { text: message, style: { margin: '0' } }),
        el('div.row', { style: { gap: '10px', marginTop: '18px' } },
          el('button.btn.btn--ghost.grow', { text: 'Zrušiť', onclick: () => { close(); resolve(false); } }),
          el('button', {
            class: danger ? 'btn btn--danger grow' : 'btn grow',
            text: okLabel,
            onclick: () => { close(); resolve(true); },
          }),
        ),
      );
    });
  });
}

/* ---------- formulárové polia ---------- */
export function field(label, input) {
  return el('label.field', {}, el('span.field__label', { text: label }), input);
}
export function textInput(props = {}) {
  return el('input.input', { type: 'text', ...props });
}
export function selectInput(options, props = {}) {
  const s = el('select.select', props);
  for (const o of options) {
    s.append(el('option', { value: o.value, text: o.label, selected: o.value === props.value }));
  }
  s.value = props.value ?? s.value;
  return s;
}

/* ---------- CSV export ---------- */
/**
 * Skopíruje text do schránky. Schránka je vrtošivá — prehliadač ju odmietne
 * bez priameho ťuknutia, na starších telefónoch ju nemá vôbec. Preto pri
 * neúspechu text ukážeme označený, nech sa dá skopírovať ručne.
 */
export async function skopirovat(text, hlaska = 'Skopírované') {
  try {
    await navigator.clipboard.writeText(text);
    toast(hlaska);
    return true;
  } catch {
    sheet('Skopírujte ručne', (body) => {
      const pole = el('textarea.textarea', { style: { minHeight: '160px' } }, text);
      mount(body,
        el('p.small.muted', { style: { margin: 0 },
          text: 'Prehliadač nepustil kopírovanie. Text je označený — skopírujte ho podržaním prsta alebo klávesmi.' }),
        pole,
      );
      pole.focus();
      pole.select();
    });
    return false;
  }
}

export function downloadCSV(filename, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(';')).join('\r\n');
  downloadFile(filename, '﻿' + csv, 'text/csv;charset=utf-8');
}

export function downloadFile(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
