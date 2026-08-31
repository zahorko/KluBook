/* =========================================================
   Podujatia — ligy, turnaje a zápis výsledkov
   ---------------------------------------------------------
   Odtiaľto tečie väčšina XP. Zámer: motivovať k hraniu, preto sa
   XP sčítava bez stropu a účasť je odmenená sama osebe — nech má
   zmysel ísť hrať aj slabší hráč. Samotný rebríček žije
   v rebricek.js, tu sa len zapisuje, kto ako dopadol.
   ========================================================= */
import {
  el, mount, toast, sheet, confirmSheet, field, textInput, selectInput,
  fmtDate, fmtDayShort, downloadCSV,
} from '../ui.js';
import {
  db, groupName, studentById, everyone, trainsWithClub, eventById, resultsOfEvent,
  upsertEvent, deleteEvent, setEventResult, removeEventResult,
  scoringRules, DRUHY_PODUJATI, todayISO, updateSettings, isInGroup,
  stavHraca, gamifikacia,
} from '../store.js';
import { go, refresh } from '../router.js';

const uiState = { groupId: null };

export function eventsSection(podujatia) {
  return el('div', {},
    el('div.row.row--between', { style: { alignItems: 'baseline' } },
      el('h2.section-title', { text: 'Podujatia' }),
      el('button.btn.btn--ghost.btn--sm', {
        style: { marginTop: '14px' },
        text: '⤓ CSV',
        onclick: () => exportPodujatia(podujatia),
      }),
    ),
    podujatia.length === 0
      ? null
      : el('div.card.card--flush.list', {},
        podujatia.map((e) => {
          const vysledky = resultsOfEvent(e.id);
          return el('button.item', { onclick: () => go(`/podujatie/${e.id}`) },
            el('span.grow', {},
              el('div.item__title', { text: e.name }),
              el('div.item__sub', {
                text: `${fmtDayShort(e.date)} · ${DRUHY_PODUJATI[e.kind] ?? e.kind}`
                  + (e.place ? ` · ${e.place}` : ''),
              }),
            ),
            el('span.tag', { text: `${vysledky.length} hráčov` }),
            el('span.chev', { text: '›' }),
          );
        }),
      ),
    el('button.btn.btn--block', {
      style: { marginTop: '12px' },
      text: '＋ Pridať podujatie',
      onclick: () => eventSheet(null),
    }),
  );
}

/* ---------------- podujatie ---------------- */
/** Zoznam podujatí aj s výsledkami do tabuľky. */
function exportPodujatia(podujatia) {
  const rows = [['Dátum', 'Podujatie', 'Druh', 'Miesto', 'Hráč', 'Výhry', 'Remízy', 'Prehry', 'Umiestnenie', 'XP']];
  for (const e of podujatia) {
    for (const v of resultsOfEvent(e.id)) {
      const z = studentById(v.studentId);
      rows.push([e.date, e.name, DRUHY_PODUJATI[e.kind] ?? e.kind, e.place || '',
        z?.name ?? '—', v.wins || 0, v.draws || 0, v.losses || 0, v.placement || '', v.points || 0]);
    }
  }
  downloadCSV(`podujatia-${todayISO()}.csv`, rows);
  toast('CSV stiahnuté');
}

export function renderEvent(root, eventId) {
  const e = eventById(eventId);
  if (!e) { mount(root, el('div.empty', { text: 'Podujatie sa nenašlo.' })); return; }

  const vysledky = resultsOfEvent(e.id)
    .map((r) => ({ ...r, student: studentById(r.studentId) }))
    .filter((r) => r.student)
    .sort((a, b) => b.points - a.points || a.student.name.localeCompare(b.student.name, 'sk'));

  const r = scoringRules()[e.kind];
  const zoznam = el('div.stack');

  const paint = () => {
    const aktualne = resultsOfEvent(e.id)
      .map((x) => ({ ...x, student: studentById(x.studentId) }))
      .filter((x) => x.student)
      .sort((a, b) => b.points - a.points || a.student.name.localeCompare(b.student.name, 'sk'));

    mount(zoznam, aktualne.length === 0
      ? el('div.empty', { text: 'Zatiaľ tu nikto nie je. Pridajte hráčov tlačidlom nižšie.' })
      : aktualne.map((v) => hracRiadok(e, v, paint)));
  };
  paint();

  mount(root, el('div.stack-lg', {},
    el('div.card.card--warm.stack', {},
      el('div.row.row--between', {},
        el('div.grow', {},
          el('h2', { text: e.name, style: { fontSize: '19px' } }),
          el('div.small.muted', { text: `${fmtDate(e.date)} · ${DRUHY_PODUJATI[e.kind] ?? e.kind}${e.place ? ` · ${e.place}` : ''}` }),
        ),
        el('button.btn.btn--ghost.btn--sm', { text: 'Upraviť', onclick: () => eventSheet(e) }),
      ),
      el('p.tiny.faint', { style: { margin: 0 },
        text: e.kind === 'liga'
          ? `Účasť ${r.ucast} b · výhra ${r.vyhra} · remíza ${r.remiza} · prehra ${r.prehra}`
          : `Účasť ${r.ucast} b · za partiu ${r.vyhra}/${r.remiza}/${r.prehra} · umiestnenie podľa pravidiel`,
      }),
    ),

    el('div', {},
      el('h2.section-title', { text: 'Hráči a výsledky' }),
      zoznam,
    ),

    el('button.btn.btn--block', { text: '＋ Pridať hráčov', onclick: () => addPlayersSheet(e, paint) }),

    el('button.btn.btn--danger.btn--block', {
      text: 'Zmazať podujatie',
      onclick: async () => {
        const ok = await confirmSheet('Zmazať podujatie?',
          `${e.name} sa zmaže aj s bodmi všetkých hráčov. Akcia sa nedá vrátiť.`,
          { danger: true, okLabel: 'Zmazať' });
        if (!ok) return;
        deleteEvent(e.id);
        toast('Podujatie zmazané');
        go('/prehlady');
      },
    }),
  ));
  void vysledky;
}

/** Jeden hráč na podujatí — pri lige rýchle V/R/P, pri turnaji počty partií. */
function hracRiadok(event, v, paint) {
  // XP sa počíta, level teda nikto „nezapíše" — porovnáme ho pred zápisom
  // a po ňom, nech postup nezapadne
  const uloz = (data) => {
    const pred = stavHraca(v.studentId);
    setEventResult(event.id, v.studentId, data);
    const po = stavHraca(v.studentId);
    paint();
    if (po.level > pred.level) {
      toast(`${v.student.name} má level ${po.level} · +${gamifikacia().goldZaLevel} goldov`, { oslava: true });
    }
  };

  const jePartia = (typ) => (typ === 'v' ? v.wins : typ === 'r' ? v.draws : v.losses) > 0;
  const tlacidloVysledku = (typ, popis, farba) => el('button.btn.btn--sm', {
    text: popis,
    style: jePartia(typ)
      ? { background: farba, color: '#fff', borderColor: 'transparent', minWidth: '42px' }
      : { background: 'var(--white)', color: 'var(--ink-soft)', border: '1px solid var(--cream-line)', minWidth: '42px' },
    onclick: () => uloz({
      wins: typ === 'v' ? 1 : 0,
      draws: typ === 'r' ? 1 : 0,
      losses: typ === 'p' ? 1 : 0,
    }),
  });

  const pocitadlo = (popis, kluc) => el('div.row', { style: { gap: '4px', alignItems: 'center' } },
    el('span.tiny.faint', { text: popis, style: { minWidth: '14px' } }),
    el('button.iconbtn', {
      text: '−', style: { width: '30px', height: '30px' },
      onclick: () => uloz({ [kluc]: Math.max(0, (v[kluc] || 0) - 1) }),
    }),
    el('span.mono', { style: { minWidth: '18px', textAlign: 'center' }, text: String(v[kluc] || 0) }),
    el('button.iconbtn', {
      text: '+', style: { width: '30px', height: '30px' },
      onclick: () => uloz({ [kluc]: (v[kluc] || 0) + 1 }),
    }),
  );

  return el('div.card.stack', { style: { padding: '12px 14px', gap: '10px' } },
    el('div.row', {},
      el('span.grow', {},
        el('div', { style: { fontWeight: '500' }, text: v.student.name }),
        el('div.item__sub', {
          text: v.placement ? `${v.placement}. miesto` : (v.wins + v.draws + v.losses ? 'zapísané' : 'len účasť'),
        }),
      ),
      el('span.mono', { style: { fontWeight: '700', fontSize: '16px' }, text: `${v.points} XP` }),
      el('button.iconbtn', {
        text: '✕', title: 'Odobrať z podujatia',
        onclick: async () => {
          const ok = await confirmSheet('Odobrať hráča?', `${v.student.name} sa odoberie z tohto podujatia.`,
            { danger: true, okLabel: 'Odobrať' });
          if (!ok) return;
          removeEventResult(event.id, v.studentId);
          paint();
        },
      }),
    ),
    event.kind === 'liga'
      ? el('div.row', { style: { gap: '8px' } },
        tlacidloVysledku('v', 'Výhra', 'var(--green)'),
        tlacidloVysledku('r', 'Remíza', 'var(--ink-soft)'),
        tlacidloVysledku('p', 'Prehra', 'var(--red)'),
      )
      : el('div.row.wrap', { style: { gap: '10px' } },
        pocitadlo('V', 'wins'),
        pocitadlo('R', 'draws'),
        pocitadlo('P', 'losses'),
        el('input.input', {
          type: 'number', min: '1', placeholder: 'miesto',
          value: v.placement ?? '',
          style: { width: '92px', minHeight: '36px', padding: '6px 10px' },
          onchange: (e2) => uloz({ placement: e2.target.value ? Number(e2.target.value) : null }),
        }),
      ),
  );
}

/* ---------------- hárky ---------------- */
function eventSheet(zaznam) {
  const novy = !zaznam;
  sheet(novy ? 'Nové podujatie' : 'Upraviť podujatie', (body, close) => {
    const nazov = textInput({ value: zaznam?.name ?? '', placeholder: 'napr. 3. kolo krajskej ligy' });
    const druh = selectInput(
      Object.entries(DRUHY_PODUJATI).map(([value, label]) => ({ value, label })),
      { value: zaznam?.kind ?? 'turnaj' },
    );
    const datum = el('input.input', { type: 'date', value: zaznam?.date ?? todayISO() });
    const miesto = textInput({ value: zaznam?.place ?? '', placeholder: 'nepovinné' });

    mount(body,
      field('Názov *', nazov),
      field('Druh', druh),
      el('div.grid2', {}, field('Dátum', datum), field('Miesto', miesto)),
      el('p.tiny.faint', { style: { margin: '-4px 2px 0' },
        text: 'Ligové kolo = jedna partia. Turnaj = viac partií za deň, dá sa zapísať aj umiestnenie.' }),
      el('button.btn.btn--block', {
        text: novy ? 'Vytvoriť' : 'Uložiť',
        style: { marginTop: '8px' },
        onclick: () => {
          if (!nazov.value.trim()) { toast('Zadajte názov'); return; }
          const e = upsertEvent({
            id: zaznam?.id,
            name: nazov.value.trim(),
            kind: druh.value,
            date: datum.value || todayISO(),
            place: miesto.value.trim(),
          });
          close();
          toast('Uložené');
          if (novy) go(`/podujatie/${e.id}`); else refresh();
        },
      }),
    );
  });
}

/** Pridanie hráčov na podujatie — vrátane tých, čo nechodia na tréningy. */
function addPlayersSheet(event, hotovo) {
  sheet('Pridať hráčov', (body, close) => {
    const uz = new Set(resultsOfEvent(event.id).map((r) => r.studentId));
    const zvolene = new Set();
    const hladanie = textInput({ placeholder: 'Hľadať…' });
    const zoznam = el('div.stack', { style: { gap: '6px', maxHeight: '46vh', overflowY: 'auto' } });

    const paint = () => {
      const q = hladanie.value.trim().toLowerCase();
      const ludia = everyone().filter((s) => !uz.has(s.id) && (!q || s.name.toLowerCase().includes(q)));
      mount(zoznam, ludia.length === 0
        ? el('p.small.faint', { text: 'Nikto ďalší. Nových ľudí pridáte v záložke Žiaci.' })
        : ludia.map((s) =>
          el('label.row', {
            style: { gap: '10px', padding: '10px 12px', border: '1px solid var(--cream-line)', borderRadius: 'var(--r-md)', background: 'var(--white)', cursor: 'pointer' },
          },
            el('input', {
              type: 'checkbox',
              // zoznam sa pri hľadaní prekresľuje — bez tohto by sa už vybraní
              // hráči tvárili ako nezaškrtnutí, hoci vo výbere ostávajú
              checked: zvolene.has(s.id),
              style: { width: '20px', height: '20px', accentColor: 'var(--terracotta)' },
              onchange: (e2) => { e2.target.checked ? zvolene.add(s.id) : zvolene.delete(s.id); },
            }),
            el('span.grow', {},
              el('div', { text: s.name }),
              el('div.tiny.faint', {
                text: trainsWithClub(s)
                  ? (s.groupIds ?? []).map(groupName).join(' · ') || 'bez skupiny'
                  : 'netrénuje',
              }),
            ),
          )),
      );
    };
    hladanie.addEventListener('input', paint);
    paint();

    mount(body,
      hladanie,
      zoznam,
      el('button.btn.btn--block', {
        text: 'Pridať vybraných',
        style: { marginTop: '8px' },
        onclick: () => {
          if (!zvolene.size) { toast('Nikto nie je vybraný'); return; }
          for (const id of zvolene) setEventResult(event.id, id, {});
          close();
          toast(`Pridaných: ${zvolene.size}`);
          hotovo();
        },
      }),
    );
  });
}

export function seasonSheet(from, to) {
  sheet('Sezóna', (body, close) => {
    const od = el('input.input', { type: 'date', value: from });
    const doo = el('input.input', { type: 'date', value: to });
    mount(body,
      el('p.small.muted', { style: { margin: 0 },
        text: 'Rebríček počíta podujatia v tomto období. Predvolene ide o šachový rok od septembra do augusta.' }),
      el('div.grid2', {}, field('Od', od), field('Do', doo)),
      el('button.btn.btn--block', {
        text: 'Uložiť',
        style: { marginTop: '8px' },
        onclick: () => {
          if (doo.value <= od.value) { toast('Koniec musí byť po začiatku'); return; }
          updateSettings({ seasonStart: od.value, seasonEnd: doo.value });
          close();
          toast('Uložené');
          refresh();
        },
      }),
    );
  });
}


void isInGroup;
void db;
