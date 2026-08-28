/* =========================================================
   app.js — shell, router, navigácia, stav synchronizácie
   ========================================================= */
import { el, mount, toast } from './ui.js';
import {
  db, initStore, currentTrainer, openSession, isCloud,
  applyServerData, syncNow, logout, isLocked,
} from './store.js';
import { state as syncState, onSyncChange, startAutoSync } from './sync.js';
import { currentRoute, onRefresh, go } from './router.js';
import { renderLogin } from './views/login.js';
import { renderTraining, renderSession, stopClock } from './views/training.js';
import { renderStudents, renderStudentDetail } from './views/students.js';
import { renderPayments } from './views/payments.js';
import { renderReports } from './views/reports.js';
import { renderSettings } from './views/settings.js';
import { renderEvent } from './views/points.js';
import { renderRebricek } from './views/rebricek.js';

const TABS = [
  { path: 'trening', label: 'Tréning', icon: '♟' },
  { path: 'ziaci', label: 'Žiaci', icon: '👥' },
  { path: 'rebricek', label: 'Rebríček', icon: '🏆' },
  { path: 'platby', label: 'Platby', icon: '€' },
  { path: 'prehlady', label: 'Prehľady', icon: '📊' },
  { path: 'nastavenia', label: 'Viac', icon: '⚙' },
];

const TITLES = {
  trening: 'Tréning',
  ziaci: 'Žiaci',
  platby: 'Platby',
  rebricek: 'Rebríček',
  prehlady: 'Prehľady',
  nastavenia: 'Nastavenia',
  podujatie: 'Podujatie',
};

const app = document.getElementById('app');
const shortName = () => db.settings.shortName || db.settings.clubName;
const modalOpen = () => document.getElementById('modal-root').childElementCount > 0;

/* Ktorú obrazovku sme vykreslili naposledy — aby prekreslenie tej istej
   obrazovky neodskočilo hore. */
let poslednaObrazovka = null;

function render() {
  stopClock();
  const trainer = currentTrainer();

  // zamknuté = po dlhšej nečinnosti alebo po ručnom zamknutí pýtame PIN
  if (!trainer || isLocked()) {
    renderLogin(app);
    return;
  }
  if (trainer.unlinked) {
    renderUnlinked(trainer);
    return;
  }

  const { path, param } = currentRoute();
  if (!path || !TITLES[path]) { go('/trening'); return; }

  // Na novú obrazovku ideme odhora. Tú istú obrazovku (po synchronizácii
  // alebo po uložení) necháme tam, kde tréner práve je — v hárku dochádzky
  // je to rozdiel medzi použiteľným a otravným.
  const obrazovka = `${path}/${param ?? ''}`;
  const posun = obrazovka === poslednaObrazovka ? window.scrollY : 0;
  poslednaObrazovka = obrazovka;

  const content = el('main.main');
  mount(app, el('div.shell', {}, topbar(path, param, trainer), content, navbar(path)));

  switch (path) {
    case 'trening':
      param ? renderSession(content, trainer, param) : renderTraining(content, trainer);
      break;
    case 'ziaci':
      param ? renderStudentDetail(content, param) : renderStudents(content);
      break;
    case 'platby':
      renderPayments(content);
      break;
    case 'rebricek':
      renderRebricek(content);
      break;
    case 'prehlady':
      renderReports(content);
      break;
    case 'nastavenia':
      renderSettings(content, trainer);
      break;
    case 'podujatie':
      renderEvent(content, param);
      break;
  }

  window.scrollTo(0, posun);
}

/* Účet existuje, ale nie je zapísaný v tabuľke trénerov. */
function renderUnlinked(trainer) {
  mount(app, el('div.login', {}, el('div.login__inner.stack', {},
    el('div.center', {},
      el('div.login__logo', { text: '♟' }),
      el('h1.login__title', { text: 'Účet ešte nie je aktivovaný' }),
    ),
    el('div.card.stack', {},
      el('p.small.muted', { style: { margin: 0 },
        text: `Prihlásenie prebehlo v poriadku (${trainer.name}), ale tento účet zatiaľ nie je pridaný medzi trénerov klubu. Požiadajte správcu, aby vás doplnil — postup je v súbore NASADENIE.md, krok 5.` }),
      el('button.btn.btn--block', { text: 'Skúsiť znova', onclick: () => location.reload() }),
      el('button.btn.btn--ghost.btn--block', {
        text: 'Odhlásiť sa',
        onclick: async () => { await logout(); location.reload(); },
      }),
    ),
  )));
}

function topbar(path, param, trainer) {
  const live = openSession();
  return el('header.topbar', {},
    param ? el('button.iconbtn', { text: '‹', 'aria-label': 'Späť', onclick: () => history.back() }) : null,
    el('div.grow', {},
      el('h1.topbar__title', { text: param ? TITLES[path] : shortName() }),
      el('div.topbar__sub', { text: param ? shortName() : TITLES[path] }),
    ),
    live && path !== 'trening'
      ? el('button.tag.tag--live', {
        text: '● PREBIEHA', style: { border: 'none', cursor: 'pointer' },
        onclick: () => go('/trening'),
      })
      : null,
    syncChip(),
    el('button.avatar', { text: trainer.initials, title: trainer.name, onclick: () => go('/nastavenia') }),
  );
}

/** Malý indikátor stavu synchronizácie v hlavičke. */
function syncChip() {
  if (!isCloud()) return null;
  const chip = el('button.iconbtn', {
    title: 'Synchronizácia',
    onclick: async () => {
      toast('Synchronizujem…');
      try {
        const data = await syncNow();
        if (data) applyServerData(data);
        toast(syncState.pending ? `Čaká ${syncState.pending} zmien` : 'Zosynchronizované');
        render();
      } catch {
        toast('Server nedostupný — zmeny čakajú v zariadení');
      }
    },
  });

  const paint = () => {
    const { status, pending } = syncState;
    if (status === 'syncing') { chip.textContent = '↻'; chip.style.color = 'var(--terracotta)'; }
    else if (status === 'offline' || status === 'error') { chip.textContent = pending ? String(pending) : '!'; chip.style.color = 'var(--red)'; }
    else if (pending) { chip.textContent = String(pending); chip.style.color = 'var(--terracotta)'; }
    else { chip.textContent = '✓'; chip.style.color = 'var(--green)'; }
  };
  paint();
  const off = onSyncChange(() => {
    if (!document.body.contains(chip)) { off(); return; }
    paint();
  });
  return chip;
}

function navbar(active) {
  return el('nav.nav', {},
    TABS.map((t) =>
      el('button.nav__item', {
        'aria-current': t.path === active || (active === 'podujatie' && t.path === 'rebricek') ? 'page' : null,
        onclick: () => go(`/${t.path}`),
      },
        el('span.nav__icon', { text: t.icon }),
        el('span', { text: t.label }),
      ),
    ),
  );
}

/* ---------- štart ---------- */
window.addEventListener('hashchange', render);
onRefresh(render);

(async function boot() {
  await initStore();
  if (!location.hash) location.hash = '#/trening';
  render();

  if (isCloud()) {
    let poslednyStav = null;
    startAutoSync((data) => {
      applyServerData(data);
      // Keď sa na serveri nič nezmenilo, nemá čo prekresľovať — appka
      // sa každú minútu pýta servera, ale obrazovka sa hýbať nemusí.
      const odtlacok = JSON.stringify(data);
      if (odtlacok === poslednyStav) return;
      poslednyStav = odtlacok;
      // neprekreslíme ani vtedy, kým má tréner otvorený formulár
      if (!modalOpen()) render();
    });
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW:', e));
  }
})();
