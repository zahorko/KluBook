/* =========================================================
   Prehľady — odučené hodiny trénerov, dochádzka žiakov, platby
   ========================================================= */
import {
  el, clear, mount, toast, fmtHours, fmtDayShort, fmtPeriod, downloadCSV,
} from '../ui.js';
import {
  db, sortedGroups, groupName, trainerName, studentsOfGroup, sessionsInRange,
  durationMinutes, attendanceOfSession, paymentStatus, todayISO, periodOf,
  periodsUpToNow,
} from '../store.js';
import { refresh } from '../router.js';

const uiState = { tab: 'treneri', range: '30' };

const rangeFrom = (days) => {
  if (days === 'all') return '2000-01-01';
  const d = new Date();
  d.setDate(d.getDate() - Number(days));
  return todayISO(d);
};

export function renderReports(root) {
  const from = rangeFrom(uiState.range);
  const to = todayISO();

  const tabs = el('div.pillbar', {},
    [['treneri', 'Tréneri'], ['ziaci', 'Žiaci'], ['platby', 'Platby']].map(([id, label]) =>
      el('button.pill', {
        text: label,
        'aria-pressed': String(uiState.tab === id),
        onclick: () => { uiState.tab = id; refresh(); },
      }),
    ),
  );

  const ranges = el('div.pillbar', {},
    [['30', 'Posledných 30 dní'], ['90', '3 mesiace'], ['365', 'Sezóna'], ['all', 'Celá história']].map(([id, label]) =>
      el('button.pill', {
        text: label,
        'aria-pressed': String(uiState.range === id),
        onclick: () => { uiState.range = id; refresh(); },
      }),
    ),
  );

  const body = el('div');
  if (uiState.tab === 'treneri') body.append(trainersReport(from, to));
  else if (uiState.tab === 'ziaci') body.append(studentsReport(from, to));
  else body.append(paymentsReport());

  mount(root, el('div.stack-lg', {}, tabs, uiState.tab === 'platby' ? null : ranges, body));
}

/* ---------------- tréneri ---------------- */
function trainersReport(from, to) {
  const sessions = sessionsInRange(from, to).filter((s) => s.endTime);
  const totals = new Map();
  for (const s of sessions) {
    const cur = totals.get(s.trainerId) ?? { count: 0, minutes: 0, groups: new Map() };
    cur.count++;
    cur.minutes += durationMinutes(s);
    cur.groups.set(s.groupId, (cur.groups.get(s.groupId) ?? 0) + 1);
    totals.set(s.trainerId, cur);
  }

  const totalMin = [...totals.values()].reduce((a, b) => a + b.minutes, 0);

  return el('div.stack-lg', {},
    el('div.stats', {},
      el('div.stat', {}, el('div.stat__num', { text: String(sessions.length) }), el('div.stat__lab', { text: 'tréningov' })),
      el('div.stat', {}, el('div.stat__num', { text: String(Math.round(totalMin / 60)) }), el('div.stat__lab', { text: 'hodín spolu' })),
      el('div.stat', {}, el('div.stat__num', { text: String(db.trainers.filter((t) => t.active).length) }), el('div.stat__lab', { text: 'trénerov' })),
    ),

    el('div', {},
      el('h2.section-title', { text: 'Odučené hodiny' }),
      totals.size === 0
        ? el('div.empty', { text: 'V tomto období nie sú žiadne ukončené tréningy.' })
        : el('div.card.card--flush.list', {},
          [...totals.entries()]
            .sort((a, b) => b[1].minutes - a[1].minutes)
            .map(([trainerId, t]) =>
              el('div.item', {},
                el('span.grow', {},
                  el('div.item__title', { text: trainerName(trainerId) }),
                  el('div.item__sub', {
                    text: [...t.groups.entries()].map(([g, n]) => `${groupName(g)} ×${n}`).join(' · '),
                  }),
                ),
                el('span', { style: { textAlign: 'right' } },
                  el('div', { class: 'mono', style: { fontWeight: '600' }, text: fmtHours(t.minutes) }),
                  el('div.item__sub', { text: `${t.count} tréningov` }),
                ),
              ),
            ),
        ),
    ),

    el('div', {},
      el('h2.section-title', { text: 'Zoznam tréningov' }),
      sessions.length === 0
        ? el('div.empty', { text: 'Nič na zobrazenie.' })
        : el('div.card.tablewrap', {},
          el('table.data', {},
            el('thead', {}, el('tr', {},
              ['Dátum', 'Skupina', 'Tréner', 'Od–Do', 'Trvanie', 'Účasť'].map((h) => el('th', { text: h })),
            )),
            el('tbody', {}, sessions.slice(0, 60).map((s) => {
              const att = attendanceOfSession(s.id);
              return el('tr', {},
                el('td', { text: fmtDayShort(s.date) }),
                el('td', { text: groupName(s.groupId) }),
                el('td', { text: trainerName(s.trainerId) }),
                el('td', { class: 'mono', text: `${s.startTime}–${s.endTime}` }),
                el('td', { class: 'mono', text: fmtHours(durationMinutes(s)) }),
                el('td', { class: 'mono', text: `${att.filter((a) => a.present).length}/${att.length}` }),
              );
            })),
          ),
        ),
    ),

    el('button.btn.btn--ghost.btn--block', {
      text: '⤓ Export tréningov do CSV',
      onclick: () => {
        const rows = [['Dátum', 'Skupina', 'Tréner', 'Začiatok', 'Koniec', 'Minúty', 'Prítomní', 'Zapísaní']];
        for (const s of sessions) {
          const att = attendanceOfSession(s.id);
          rows.push([s.date, groupName(s.groupId), trainerName(s.trainerId), s.startTime, s.endTime,
            durationMinutes(s), att.filter((a) => a.present).length, att.length]);
        }
        downloadCSV(`treningy-${from}_${to}.csv`, rows);
        toast('CSV stiahnuté');
      },
    }),
  );
}

/* ---------------- žiaci ---------------- */
function studentsReport(from, to) {
  const sessions = sessionsInRange(from, to);
  const byGroup = new Map();
  for (const s of sessions) {
    if (!byGroup.has(s.groupId)) byGroup.set(s.groupId, []);
    byGroup.get(s.groupId).push(s);
  }

  const blocks = sortedGroups().map((g) => {
    const gs = byGroup.get(g.id) ?? [];
    const ids = new Set(gs.map((s) => s.id));
    const rows = studentsOfGroup(g.id).map((st) => {
      const recs = db.attendance.filter((a) => a.studentId === st.id && ids.has(a.sessionId));
      const present = recs.filter((a) => a.present).length;
      const missed = recs.length - present;
      const rate = recs.length ? Math.round((present / recs.length) * 100) : 0;
      return { st, total: recs.length, present, missed, rate };
    }).sort((a, b) => b.rate - a.rate);

    return el('div', {},
      el('div.row.row--between', { style: { alignItems: 'baseline' } },
        el('h2.section-title', { text: g.name }),
        el('span.tiny.faint', { text: `${gs.length} tréningov` }),
      ),
      rows.length === 0
        ? el('div.empty', { text: 'Žiadni žiaci v skupine.' })
        : el('div.card.card--flush.list', {},
          rows.map((r) =>
            el('div.item', {},
              el('span.grow', {},
                el('div.item__title', { text: r.st.name }),
                el('div.bar', { style: { marginTop: '6px', maxWidth: '190px' } },
                  el('div', { class: `bar__fill${r.rate >= 75 ? ' bar__fill--good' : ''}`, style: { width: `${r.rate}%` } }),
                ),
              ),
              el('span', { style: { textAlign: 'right' } },
                el('div.mono', { style: { fontWeight: '600' }, text: `${r.rate}%` }),
                el('div.item__sub', { text: `${r.present}× tu · ${r.missed}× chýbal` }),
              ),
            ),
          ),
        ),
    );
  });

  return el('div.stack-lg', {},
    ...blocks,
    el('button.btn.btn--ghost.btn--block', {
      text: '⤓ Export dochádzky do CSV',
      onclick: () => {
        const rows = [['Skupina', 'Žiak', 'Tréningov', 'Prítomný', 'Vymeškal', 'Účasť %']];
        for (const g of sortedGroups()) {
          const ids = new Set((byGroup.get(g.id) ?? []).map((s) => s.id));
          for (const st of studentsOfGroup(g.id)) {
            const recs = db.attendance.filter((a) => a.studentId === st.id && ids.has(a.sessionId));
            const present = recs.filter((a) => a.present).length;
            rows.push([g.name, st.name, recs.length, present, recs.length - present,
              recs.length ? Math.round((present / recs.length) * 100) : 0]);
          }
        }
        downloadCSV(`dochadzka-ziakov-${from}_${to}.csv`, rows);
        toast('CSV stiahnuté');
      },
    }),
  );
}

/* ---------------- platby ---------------- */
function paymentsReport() {
  // len mesiace, odkedy klub platby naozaj eviduje — prázdna minulosť nikoho nezaujíma
  const periods = periodsUpToNow();

  // prázdne skupiny do prehľadu nepatria — len by zavadzali
  const skupiny = sortedGroups()
    .map((g) => ({ g, ziaci: studentsOfGroup(g.id) }))
    .filter(({ ziaci }) => ziaci.length);

  if (!skupiny.length) {
    return el('div.empty', {},
      el('span.empty__mark', { text: '♟' }),
      'Zatiaľ tu nie sú žiadni žiaci. Pridajte ich v záložke Žiaci.',
    );
  }

  // Skupinu píšeme pod meno, nie ako samostatný riadok cez celú tabuľku —
  // taký riadok pri posúvaní doprava odscrolloval a nechával prázdne pásy.
  const viacSkupin = skupiny.length > 1;

  return el('div.stack-lg', {},
    el('div.card.card--flush.tablewrap', {},
      el('table.data.data--compact', {},
        el('thead', {}, el('tr', {},
          el('th', { text: 'Žiak' }),
          periods.map((p) => el('th', { class: 'num', text: `${p.slice(5)}/${p.slice(2, 4)}` })),
        )),
        el('tbody', {}, skupiny.flatMap(({ g, ziaci }) =>
          ziaci.map((s) =>
            el('tr', {},
              el('td', {},
                el('div', { text: s.name }),
                viacSkupin ? el('div.item__sub', { text: g.name }) : null,
              ),
              periods.map((p) => {
                const paid = paymentStatus(s.id, p) === 'paid';
                const future = p > periodOf(todayISO());
                return el('td', { class: 'num' },
                  el('span', {
                    class: `dot dot--${future ? 'none' : paid ? 'paid' : 'unpaid'}`,
                    title: `${s.name} · ${fmtPeriod(p)}: ${paid ? 'zaplatené' : 'nezaplatené'}`,
                    style: { margin: '0 auto' },
                  }),
                );
              }),
            ),
          ),
        )),
      ),
    ),
    el('div.card.row.small.muted', { style: { gap: '16px' } },
      el('span.row', { style: { gap: '6px' } }, el('span.dot.dot--paid'), 'zaplatené'),
      el('span.row', { style: { gap: '6px' } }, el('span.dot.dot--unpaid'), 'nezaplatené'),
    ),
    el('button.btn.btn--ghost.btn--block', {
      text: '⤓ Export histórie platieb do CSV',
      onclick: () => {
        const rows = [['Skupina', 'Žiak', ...periods.map(fmtPeriod)]];
        for (const g of sortedGroups()) {
          for (const s of studentsOfGroup(g.id)) {
            rows.push([g.name, s.name, ...periods.map((p) => (paymentStatus(s.id, p) === 'paid' ? 'zaplatené' : 'nezaplatené'))]);
          }
        }
        downloadCSV(`platby-historia-${todayISO()}.csv`, rows);
        toast('CSV stiahnuté');
      },
    }),
  );
}
