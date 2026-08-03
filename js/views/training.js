/* =========================================================
   Tréning — dochádzka trénera + dochádzka žiakov
   ========================================================= */
import {
  el, clear, mount, toast, sheet, confirmSheet, field, textInput, selectInput,
  fmtDateLong, fmtDayShort, fmtHours,
} from '../ui.js';
import {
  db, sortedGroups, groupName, trainerName, openSession, startSession, endSession,
  addManualSession, deleteSession, studentsOfGroup, attendanceOfSession, setAttendance,
  paymentStatus, durationMinutes, todayISO, nowHM, periodOf, sessionsInRange, updateSession,
} from '../store.js';
import { go, refresh } from '../router.js';

let clockTimer = null;
export function stopClock() { clearInterval(clockTimer); clockTimer = null; }

/* ---------------- prehľad / domov ---------------- */
export function renderTraining(root, trainer) {
  stopClock();
  const live = openSession();
  const box = el('div.stack-lg');

  if (live) box.append(liveCard(live, trainer));
  else box.append(startCard(trainer));

  box.append(recentSessions(trainer));
  mount(root, box);
}

function startCard(trainer) {
  return el('div.stack', {},
    el('h2.section-title', { text: 'Začať tréning' }),
    el('div.stack', {},
      sortedGroups().map((g) => {
        const count = studentsOfGroup(g.id).length;
        return el('button.btn.btn--big.btn--block', {
          onclick: () => {
            const s = startSession({ trainerId: trainer.id, groupId: g.id });
            toast(`Tréning „${g.name}" začal o ${s.startTime}`);
            go(`/trening/${s.id}`);
          },
        },
          el('span.grow', { style: { textAlign: 'left' } },
            el('div', { text: g.name }),
            el('div', { text: `${count} ${sklonuj(count, 'žiak', 'žiaci', 'žiakov')}`, style: { fontSize: '12.5px', opacity: '.8', fontWeight: '400' } }),
          ),
          el('span', { text: '▶', style: { fontSize: '13px' } }),
        );
      }),
    ),
    el('button.btn.btn--ghost.btn--block', {
      text: '＋ Ručný záznam (spätne)',
      onclick: () => manualSheet(trainer),
    }),
  );
}

function liveCard(session, trainer) {
  const clock = el('div.live__clock', { text: '00:00' });
  const tick = () => {
    const [h, m] = session.startTime.split(':').map(Number);
    const start = new Date();
    start.setHours(h, m, 0, 0);
    const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const hh = String(Math.floor(diff / 3600)).padStart(2, '0');
    const mm = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const ss = String(diff % 60).padStart(2, '0');
    clock.textContent = diff >= 3600 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
  };
  tick();
  stopClock();
  clockTimer = setInterval(tick, 1000);

  const att = attendanceOfSession(session.id);
  const present = att.filter((a) => a.present).length;

  return el('div.stack', {},
    el('div.live', {},
      el('div.row.row--between', {},
        el('span.tag.tag--live', { text: '● PREBIEHA' }),
        el('span.live__meta', { text: `od ${session.startTime}` }),
      ),
      clock,
      el('div.live__meta', { style: { marginTop: '2px' }, text: `${groupName(session.groupId)} · ${trainerName(session.trainerId)}` }),
      el('div.row', { style: { gap: '10px', marginTop: '16px' } },
        el('button.btn.btn--white.grow', {
          text: 'Ukončiť tréning',
          onclick: async () => {
            const ok = await confirmSheet('Ukončiť tréning?',
              `Zapíše sa čas ukončenia ${nowHM()}. Dochádzku žiakov môžete upraviť aj neskôr.`,
              { okLabel: 'Ukončiť' });
            if (!ok) return;
            const s = endSession(session.id);
            stopClock();
            toast(`Tréning ukončený · ${fmtHours(durationMinutes(s))}`);
            refresh();
          },
        }),
        el('button.btn.btn--ghost', {
          text: 'Dochádzka',
          onclick: () => go(`/trening/${session.id}`),
        }),
      ),
    ),
    el('div.card.row', { style: { gap: '10px' } },
      el('span.grow.small', {}, el('strong', { text: `${present}/${att.length}` }), ' prítomných žiakov'),
      el('button.btn.btn--soft.btn--sm', { text: 'Označiť dochádzku', onclick: () => go(`/trening/${session.id}`) }),
    ),
  );
}

function recentSessions(trainer) {
  const from = new Date();
  from.setDate(from.getDate() - 60);
  const list = sessionsInRange(todayISO(from), todayISO()).filter((s) => s.endTime).slice(0, 8);

  return el('div', {},
    el('h2.section-title', { text: 'Posledné tréningy' }),
    list.length === 0
      ? el('div.empty', {}, el('span.empty__mark', { text: '♞' }), 'Zatiaľ žiadne zaznamenané tréningy.')
      : el('div.card.card--flush.list', {},
        list.map((s) => {
          const att = attendanceOfSession(s.id);
          const present = att.filter((a) => a.present).length;
          return el('button.item', { onclick: () => go(`/trening/${s.id}`) },
            el('span.grow', {},
              el('div.item__title', { text: groupName(s.groupId) }),
              el('div.item__sub', { text: `${fmtDayShort(s.date)} · ${s.startTime}–${s.endTime} · ${trainerName(s.trainerId)}` }),
            ),
            el('span.tag', { text: `${present}/${att.length}` }),
            el('span.chev', { text: '›' }),
          );
        }),
      ),
  );
}

/* ---------------- detail tréningu = hárok dochádzky ---------------- */
export function renderSession(root, trainer, sessionId) {
  stopClock();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) {
    mount(root, el('div.empty', { text: 'Tréning sa nenašiel.' }));
    return;
  }

  const period = periodOf(session.date);
  const students = studentsOfGroup(session.groupId);
  const counter = el('span.tag');
  const listBox = el('div.att-list');

  const paint = () => {
    const att = attendanceOfSession(session.id);
    const map = new Map(att.map((a) => [a.studentId, a]));
    const present = students.filter((s) => map.get(s.id)?.present).length;
    counter.textContent = `${present}/${students.length} prítomných`;

    mount(listBox, 
      students.length === 0
        ? el('div.empty', {}, 'V tejto skupine zatiaľ nie sú žiadni žiaci.')
        : students.map((s) => {
          const rec = map.get(s.id);
          const state = rec ? (rec.present ? 'present' : 'absent') : 'none';
          const pay = paymentStatus(s.id, period);
          return el('button', {
            class: `att${state === 'present' ? ' att--present' : state === 'absent' ? ' att--absent' : ''}`,
            onclick: () => {
              setAttendance(session.id, s.id, !(rec?.present ?? false));
              paint();
            },
          },
            el('span', { class: `dot dot--${pay === 'paid' ? 'paid' : 'unpaid'}`, title: pay === 'paid' ? 'Zaplatené' : 'Nezaplatené' }),
            el('span.grow', {},
              el('div.att__name', { text: s.name }),
              pay === 'paid' ? null : el('div.tiny', { style: { color: 'var(--red)' }, text: 'nezaplatené' }),
            ),
            el('span.att__mark', { text: state === 'present' ? '✓' : state === 'absent' ? '✕' : '–' }),
          );
        }),
    );
  };

  const markAll = (present) => {
    for (const s of students) setAttendance(session.id, s.id, present);
    paint();
    toast(present ? 'Všetci označení ako prítomní' : 'Všetci označení ako neprítomní');
  };

  paint();

  mount(root, el('div.stack-lg', {},
    el('div.card.card--warm.stack', {},
      el('div.row.row--between', {},
        el('div', {},
          el('h2', { text: groupName(session.groupId), style: { fontSize: '19px' } }),
          el('div.small.muted', { text: fmtDateLong(session.date) }),
          el('div.tiny.faint', {
            text: `${session.startTime}–${session.endTime ?? '…'} · ${trainerName(session.trainerId)}`,
          }),
        ),
        session.endTime ? null : el('span.tag.tag--live', { text: '● PREBIEHA' }),
      ),
      el('div.row.wrap', { style: { gap: '8px' } },
        counter,
        el('span.grow'),
        el('button.btn.btn--ghost.btn--sm', { text: 'Všetci ✓', onclick: () => markAll(true) }),
        el('button.btn.btn--ghost.btn--sm', { text: 'Všetci ✕', onclick: () => markAll(false) }),
      ),
      session.endTime ? null : el('button.btn.btn--block', {
        text: 'Ukončiť tréning',
        onclick: async () => {
          const ok = await confirmSheet('Ukončiť tréning?', `Zapíše sa čas ukončenia ${nowHM()}.`, { okLabel: 'Ukončiť' });
          if (!ok) return;
          endSession(session.id);
          toast('Tréning ukončený');
          go('/trening');
        },
      }),
    ),

    el('div', {},
      el('h2.section-title', { text: 'Dochádzka žiakov' }),
      el('p.tiny.faint', { style: { margin: '-4px 2px 10px' }, text: 'Ťuknutím na meno prepnete prítomný / neprítomný. Bodka vľavo = stav platby za tento mesiac.' }),
      listBox,
    ),

    el('div.row', { style: { gap: '10px' } },
      el('button.btn.btn--ghost.grow', { text: 'Upraviť čas', onclick: () => editTimesSheet(session) }),
      el('button.btn.btn--danger', {
        text: 'Zmazať',
        onclick: async () => {
          const ok = await confirmSheet('Zmazať tréning?', 'Zmaže sa aj dochádzka žiakov k tomuto tréningu. Akcia sa nedá vrátiť.', { danger: true, okLabel: 'Zmazať' });
          if (!ok) return;
          deleteSession(session.id);
          toast('Tréning zmazaný');
          go('/trening');
        },
      }),
    ),
  ));
}

/* ---------------- hárky ---------------- */
function editTimesSheet(session) {
  sheet('Upraviť tréning', (body, close) => {
    const date = el('input.input', { type: 'date', value: session.date });
    const start = el('input.input', { type: 'time', value: session.startTime });
    const end = el('input.input', { type: 'time', value: session.endTime ?? '' });
    const group = selectInput(sortedGroups().map((g) => ({ value: g.id, label: g.name })), { value: session.groupId });
    const trainer = selectInput(db.trainers.map((t) => ({ value: t.id, label: t.name })), { value: session.trainerId });

    body.append(
      field('Dátum', date),
      el('div.grid2', {}, field('Začiatok', start), field('Koniec', end)),
      field('Skupina', group),
      field('Tréner', trainer),
      el('button.btn.btn--block', {
        text: 'Uložiť',
        style: { marginTop: '8px' },
        onclick: () => {
          session.date = date.value || session.date;
          session.startTime = start.value || session.startTime;
          session.endTime = end.value || null;
          session.groupId = group.value;
          session.trainerId = trainer.value;
          updateSession(session);
          close();
          toast('Uložené');
          refresh();
        },
      }),
    );
  });
}

export function manualSheet(trainer) {
  sheet('Ručný záznam tréningu', (body, close) => {
    const date = el('input.input', { type: 'date', value: todayISO() });
    const start = el('input.input', { type: 'time', value: '16:00' });
    const end = el('input.input', { type: 'time', value: '17:30' });
    const group = selectInput(sortedGroups().map((g) => ({ value: g.id, label: g.name })));
    const trainerSel = selectInput(db.trainers.map((t) => ({ value: t.id, label: t.name })), { value: trainer.id });
    const note = textInput({ placeholder: 'napr. turnajová príprava' });

    body.append(
      el('p.small.muted', { style: { margin: 0 }, text: 'Pre tréning, ktorý ste zabudli zapísať. Dochádzku žiakov doplníte hneď na ďalšej obrazovke.' }),
      field('Dátum', date),
      el('div.grid2', {}, field('Začiatok', start), field('Koniec', end)),
      field('Skupina', group),
      field('Tréner', trainerSel),
      field('Poznámka (nepovinné)', note),
      el('button.btn.btn--block', {
        text: 'Zapísať tréning',
        style: { marginTop: '8px' },
        onclick: () => {
          if (!date.value || !start.value || !end.value) { toast('Vyplňte dátum a časy'); return; }
          if (end.value <= start.value) { toast('Koniec musí byť po začiatku'); return; }
          const s = addManualSession({
            trainerId: trainerSel.value,
            groupId: group.value,
            date: date.value,
            startTime: start.value,
            endTime: end.value,
            note: note.value.trim(),
          });
          close();
          toast('Tréning zapísaný');
          go(`/trening/${s.id}`);
        },
      }),
    );
  });
}

export function sklonuj(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}
