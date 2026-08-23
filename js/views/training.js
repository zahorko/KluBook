/* =========================================================
   Tréning — dochádzka trénera + dochádzka žiakov
   ========================================================= */
import {
  el, clear, mount, toast, sheet, confirmSheet, field, textInput, selectInput,
  fmtDateLong, fmtDayShort, fmtHours,
} from '../ui.js';
import {
  db, sortedGroups, groupName, trainerName, openSession, unfinishedSessions,
  startSession, endSession,
  addManualSession, deleteSession, studentsOfGroup, attendanceOfSession, setAttendance,
  sessionRoster, pridatelniDoTreningu, studentGroupNames,
  paymentStatus, durationMinutes, todayISO, nowHM, periodOf, sessionsInRange, updateSession,
  droppingStudents, markContacted, currentTrainer,
  todaysSchedule, missingSessions, markScheduleSkipped, DNI,
} from '../store.js';
import { go, refresh } from '../router.js';
import { contactSheet, telHref, maKontakt, textVymeskavanie } from '../contact.js';

let clockTimer = null;
export function stopClock() { clearInterval(clockTimer); clockTimer = null; }

/* ---------------- prehľad / domov ---------------- */
export function renderTraining(root, trainer) {
  stopClock();
  const live = openSession();
  const box = el('div.stack-lg');

  // neukončené tréningy z minulých dní rieši samostatné upozornenie —
  // nesmú blokovať začatie dnešného
  const zabudnute = unfinishedSessions();
  if (zabudnute.length) box.append(unfinishedCard(zabudnute));

  // nezapísané tréningy z rozvrhu — appka si ich všimne za vás
  const chybajuce = missingSessions();
  if (chybajuce.length) box.append(missingCard(chybajuce, trainer));

  if (live) box.append(liveCard(live, trainer));
  else box.append(startCard(trainer));

  const odchadzajuci = droppingStudents();
  if (odchadzajuci.length) box.append(droppingCard(odchadzajuci));

  box.append(recentSessions(trainer));
  mount(root, box);
}

const trenerMeno = () => currentTrainer()?.name ?? '';

/** Dnešné tréningy podľa rozvrhu — začnú sa jedným ťuknutím. */
function todayCard(trainer) {
  const dnes = todaysSchedule();
  if (!dnes.length) return null;

  return el('div', {},
    el('h2.section-title', { text: 'Dnes podľa rozvrhu' }),
    el('div.stack', {},
      dnes.map((r) =>
        el('div.card.row', { style: { gap: '10px' } },
          el('span.grow', {},
            el('div', { style: { fontWeight: '500' }, text: groupName(r.groupId) }),
            el('div.item__sub', { text: `${r.startTime}–${r.endTime}` }),
          ),
          r.zapisany
            ? el('span.tag.tag--paid', { text: '✓ zapísaný' })
            : el('button.btn.btn--sm', {
              text: 'Začať',
              onclick: () => {
                const s = startSession({
                  trainerId: r.trainerId || trainer.id,
                  groupId: r.groupId,
                  startTime: r.startTime,
                });
                toast(`Tréning „${groupName(r.groupId)}" začal`);
                go(`/trening/${s.id}`);
              },
            }),
        ),
      ),
    ),
  );
}

/** Tréningy, ktoré podľa rozvrhu mali byť, ale nikto ich nezapísal. */
function missingCard(zoznam, trainer) {
  return el('div.card', { style: { background: 'var(--cream-deep)', borderColor: 'transparent' } },
    el('div', { style: { fontWeight: '600', marginBottom: '4px' },
      text: zoznam.length === 1 ? 'Nezapísaný tréning' : `${zoznam.length} nezapísaných tréningov` }),
    el('p.small.muted', { style: { margin: '0 0 12px' },
      text: 'Podľa rozvrhu mali byť, ale nie sú v evidencii. Doplňte ich alebo označte, že neboli.' }),
    el('div.stack', {},
      zoznam.slice(0, 6).map((r) =>
        el('div.row', { style: { gap: '8px' } },
          el('span.grow.small', {},
            el('strong', { text: fmtDayShort(r.date) }),
            ` · ${groupName(r.groupId)} · ${r.startTime}–${r.endTime}`,
          ),
          el('button.btn.btn--sm', {
            text: 'Zapísať',
            onclick: () => manualSheet(trainer, {
              date: r.date, groupId: r.groupId, startTime: r.startTime, endTime: r.endTime,
              trainerId: r.trainerId || trainer.id,
            }),
          }),
          el('button.btn.btn--ghost.btn--sm', {
            text: 'Nebol',
            onclick: () => {
              markScheduleSkipped(r.id, r.date);
              toast('Označené — tréning v ten deň nebol');
              refresh();
            },
          }),
        ),
      ),
    ),
  );
}

/** Žiaci, ktorí niekoľkokrát po sebe nedorazili — kým neodídu nadobro. */
function droppingCard(list) {
  return el('div', {},
    el('h2.section-title', { text: 'Prestávajú chodiť' }),
    el('div.card.stack', { style: { background: 'var(--terracotta-l)', borderColor: 'transparent' } },
      el('p.small', { style: { margin: 0, color: 'var(--terracotta-d)' },
        text: 'Títo žiaci vymeškali niekoľko tréningov za sebou. Oplatí sa ozvať rodičom skôr, než prestanú chodiť úplne.' }),
      el('div.stack', {},
        list.map(({ student, count, lastPresent }) =>
          el('div.card.row', { style: { gap: '8px', padding: '10px 12px' } },
            el('button.grow', {
              style: { background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', padding: 0 },
              onclick: () => go(`/ziaci/${student.id}`),
            },
              el('div', { style: { fontWeight: '500' }, text: student.name }),
              el('div.item__sub', {
                // bezrodovo — appka nevie, či ide o chlapca alebo dievča
                text: `${sklonuj(count, '1 vymeškaný tréning', `${count} vymeškané tréningy`, `${count} vymeškaných tréningov`)} po sebe`
                  + (lastPresent ? ` · naposledy tu ${fmtDayShort(lastPresent)}` : ' · zatiaľ ani raz'),
              }),
            ),
            student.contactPhone
              ? el('a.iconbtn', {
                href: telHref(student.contactPhone),
                title: `Zavolať: ${student.contactName || student.contactPhone}`,
                style: { textDecoration: 'none' },
              }, '📞')
              : null,
            maKontakt(student)
              ? el('button.iconbtn', {
                text: '💬',
                title: 'Napísať správu',
                onclick: () => contactSheet(student, {
                  title: `Napísať — ${student.contactName || student.name}`,
                  text: textVymeskavanie(student, db.settings.shortName || db.settings.clubName, trenerMeno()),
                }),
              })
              : null,
            el('button.btn.btn--ghost.btn--sm', {
              text: 'Vybavené',
              onclick: async () => {
                const ok = await confirmSheet('Ozvali ste sa?',
                  `Upozornenie na žiaka ${student.name} zmizne. Objaví sa znova, ak bude chýbať ďalej.`,
                  { okLabel: 'Áno, vybavené' });
                if (!ok) return;
                markContacted(student.id);
                toast('Zapísané');
                refresh();
              },
            }),
          ),
        ),
      ),
    ),
  );
}

/** Upozornenie na tréningy bez zapísaného konca. */
function unfinishedCard(sessions) {
  return el('div.card', { style: { background: 'var(--red-l)', borderColor: 'transparent' } },
    el('div', { style: { fontWeight: '600', marginBottom: '4px' },
      text: sessions.length === 1 ? '⚠ Neukončený tréning' : `⚠ ${sessions.length} neukončené tréningy` }),
    el('p.small', { style: { margin: '0 0 12px' },
      text: 'Chýba čas ukončenia, takže sa nezaráta do odučených hodín. Doplňte ho alebo tréning zmažte.' }),
    el('div.stack', {},
      sessions.map((s) =>
        el('div.row', { style: { gap: '8px' } },
          el('span.grow.small', {}, el('strong', { text: fmtDayShort(s.date) }), ` · ${groupName(s.groupId)} · od ${s.startTime}`),
          el('button.btn.btn--sm', { text: 'Doplniť', onclick: () => editTimesSheet(s, navrhKoniec(s.startTime)) }),
          el('button.btn.btn--ghost.btn--sm', {
            text: 'Zmazať',
            onclick: async () => {
              const ok = await confirmSheet('Zmazať tréning?',
                `${fmtDayShort(s.date)} · ${groupName(s.groupId)}. Zmaže sa aj dochádzka k nemu.`,
                { danger: true, okLabel: 'Zmazať' });
              if (!ok) return;
              deleteSession(s.id);
              toast('Tréning zmazaný');
              refresh();
            },
          }),
        ),
      ),
    ),
  );
}

/* ---------------- téma tréningu ---------------- */

/** Naposledy použité témy — nech ich tréner nemusí prepisovať dokola. */
function posledneTemy(limit = 8) {
  const videne = new Set();
  return db.sessions
    .filter((s) => s.note?.trim())
    .sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`))
    .map((s) => s.note.trim())
    .filter((t) => (videne.has(t.toLowerCase()) ? false : videne.add(t.toLowerCase())))
    .slice(0, limit);
}

/** Pole na tému aj so zoznamom naposledy použitých. */
function poleTema(hodnota = '') {
  const id = `temy_${Math.random().toString(36).slice(2, 8)}`;
  const input = el('input.input', {
    type: 'text',
    value: hodnota,
    list: id,
    placeholder: 'napr. koncovky — kráľ a pešiak, taktika: vidlička',
  });
  const zoznam = el('datalist', { id }, posledneTemy().map((t) => el('option', { value: t })));
  return { input, node: el('div', {}, input, zoznam) };
}

/** Ukončenie tréningu — rovno sa pýtame, čo sa preberalo. */
function endSessionSheet(session, hotovo) {
  sheet('Ukončiť tréning', (body, close) => {
    const tema = poleTema(session.note ?? '');
    const cas = el('input.input', { type: 'time', value: nowHM() });

    mount(body,
      el('p.small.muted', { style: { margin: 0 },
        text: 'Dochádzku žiakov aj tému môžete upraviť aj neskôr.' }),
      field('Čas ukončenia', cas),
      field('Téma tréningu (nepovinné)', tema.node),
      el('p.tiny.faint', { style: { margin: '-4px 2px 0' },
        text: 'O mesiac sa vám bude hodiť vedieť, čo ste s touto skupinou preberali.' }),
      el('div.row', { style: { gap: '10px', marginTop: '14px' } },
        el('button.btn.btn--ghost.grow', { text: 'Zrušiť', onclick: close }),
        el('button.btn.grow', {
          text: 'Ukončiť tréning',
          onclick: () => {
            session.note = tema.input.value.trim();
            const s = endSession(session.id, cas.value || nowHM());
            close();
            stopClock();
            toast(`Tréning ukončený · ${fmtHours(durationMinutes(s))}`);
            hotovo?.();
          },
        }),
      ),
    );
  });
}

/** Samostatná úprava témy — dá sa doplniť aj spätne. */
function temaSheet(session) {
  sheet('Téma tréningu', (body, close) => {
    const tema = poleTema(session.note ?? '');
    mount(body,
      el('p.small.muted', { style: { margin: 0 },
        text: `${groupName(session.groupId)} · ${fmtDayShort(session.date)}` }),
      field('Čo ste preberali', tema.node),
      el('button.btn.btn--block', {
        text: 'Uložiť',
        style: { marginTop: '8px' },
        onclick: () => {
          session.note = tema.input.value.trim();
          updateSession(session);
          close();
          toast('Uložené');
          refresh();
        },
      }),
    );
  });
}

/** Rozumný odhad konca tréningu — hodina a pol po začiatku. */
function navrhKoniec(startTime) {
  const [h, m] = startTime.split(':').map(Number);
  const spolu = h * 60 + m + 90;
  return `${String(Math.floor(spolu / 60) % 24).padStart(2, '0')}:${String(spolu % 60).padStart(2, '0')}`;
}

function startCard(trainer) {
  const dnes = todayCard(trainer);
  return el('div.stack-lg', {},
    dnes,
    el('div.stack', {},
    el('h2.section-title', { text: dnes ? 'Alebo iná skupina' : 'Začať tréning' }),
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
    ),
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
          onclick: () => endSessionSheet(session, refresh),
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
              s.note ? el('div.item__sub', { style: { color: 'var(--ink-soft)' }, text: `📘 ${s.note}` }) : null,
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
  const counter = el('span.tag');
  const listBox = el('div.att-list');

  const paint = () => {
    // zoznam počítame nanovo — žiak sa dá do hárku doplniť aj dodatočne
    const students = sessionRoster(session);
    const att = attendanceOfSession(session.id);
    const map = new Map(att.map((a) => [a.studentId, a]));
    const present = students.filter((s) => map.get(s.id)?.present).length;
    counter.textContent = `${present}/${students.length} prítomných`;

    mount(listBox, 
      students.length === 0
        ? el('div.empty', {}, session.endTime
          ? 'V tomto tréningu nie je zapísaný žiaden žiak. Doplňte ich tlačidlom nižšie.'
          : 'V tejto skupine zatiaľ nie sú žiadni žiaci.')
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
    for (const s of sessionRoster(session)) setAttendance(session.id, s.id, present);
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
          el('button', {
            style: { background: 'none', border: 0, padding: '6px 0 0', cursor: 'pointer', textAlign: 'left', color: session.note ? 'var(--ink)' : 'var(--terracotta-d)' },
            onclick: () => temaSheet(session),
          }, session.note ? `📘 ${session.note}` : '＋ Doplniť tému tréningu'),
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
        onclick: () => endSessionSheet(session, () => go('/trening')),
      }),
    ),

    el('div', {},
      el('h2.section-title', { text: 'Dochádzka žiakov' }),
      el('p.tiny.faint', { style: { margin: '-4px 2px 10px' },
        text: session.endTime
          ? 'Zoznam ukazuje, kto bol na tomto tréningu zapísaný. Ťuknutím na meno prepnete prítomný / neprítomný.'
          : 'Ťuknutím na meno prepnete prítomný / neprítomný. Bodka vľavo = stav platby za tento mesiac.' }),
      listBox,
      el('button.btn.btn--ghost.btn--block', {
        text: '＋ Doplniť žiaka do dochádzky',
        style: { marginTop: '10px' },
        onclick: () => doplnitZiakaSheet(session, paint),
      }),
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

/** Doplnenie žiaka do dochádzky tréningu — pre toho, kto prišiel, ale
    v skupine vtedy ešte nebol (alebo ho medzitým niekto archivoval). */
function doplnitZiakaSheet(session, after) {
  sheet('Doplniť žiaka do dochádzky', (body, close) => {
    const kandidati = pridatelniDoTreningu(session);
    if (!kandidati.length) {
      mount(body, el('div.empty', { text: 'Všetci žiaci klubu už v tomto tréningu sú.' }));
      return;
    }
    const hladaj = textInput({ placeholder: 'Hľadať žiaka…', oninput: () => vykresli() });
    const zoznam = el('div.card.card--flush.list');

    const vykresli = () => {
      const q = hladaj.value.trim().toLowerCase();
      const vyber = q ? kandidati.filter((s) => s.name.toLowerCase().includes(q)) : kandidati;
      mount(zoznam, vyber.length === 0
        ? el('div.empty', { text: 'Nikto taký.' })
        : vyber.slice(0, 40).map((s) =>
          el('button.item', {
            onclick: () => {
              setAttendance(session.id, s.id, true);
              close();
              toast(`${s.name} doplnený ako prítomný`);
              after?.();
            },
          },
            el('span.grow', {},
              el('div.item__title', {}, s.name,
                s.active ? null : el('span.tag', { text: 'neaktívny', style: { marginLeft: '8px' } })),
              el('div.item__sub', { text: studentsOfGroup(session.groupId).some((x) => x.id === s.id)
                ? groupName(session.groupId)
                : studentGroupNames(s).join(' + ') || 'bez skupiny' }),
            ),
            el('span.chev', { text: '›' }),
          ),
        ));
    };
    vykresli();

    mount(body,
      el('p.small.muted', { style: { margin: 0 },
        text: 'Žiak sa pridá ako prítomný, potom sa dá prepnúť ťuknutím ako pri ostatných.' }),
      hladaj,
      zoznam,
    );
  });
}

function editTimesSheet(session, navrhovanyKoniec = null) {
  sheet('Upraviť tréning', (body, close) => {
    const date = el('input.input', { type: 'date', value: session.date });
    const start = el('input.input', { type: 'time', value: session.startTime });
    const end = el('input.input', { type: 'time', value: session.endTime ?? navrhovanyKoniec ?? '' });
    const group = selectInput(sortedGroups().map((g) => ({ value: g.id, label: g.name })), { value: session.groupId });
    const trainer = selectInput(db.trainers.map((t) => ({ value: t.id, label: t.name })), { value: session.trainerId });
    const tema = poleTema(session.note ?? '');

    mount(body,
      field('Dátum', date),
      el('div.grid2', {}, field('Začiatok', start), field('Koniec', end)),
      field('Skupina', group),
      field('Tréner', trainer),
      field('Téma tréningu', tema.node),
      el('button.btn.btn--block', {
        text: 'Uložiť',
        style: { marginTop: '8px' },
        onclick: () => {
          session.date = date.value || session.date;
          session.startTime = start.value || session.startTime;
          session.endTime = end.value || null;
          session.groupId = group.value;
          session.trainerId = trainer.value;
          session.note = tema.input.value.trim();
          updateSession(session);
          close();
          toast('Uložené');
          refresh();
        },
      }),
    );
  });
}

export function manualSheet(trainer, predvolene = {}) {
  sheet('Ručný záznam tréningu', (body, close) => {
    const date = el('input.input', { type: 'date', value: predvolene.date ?? todayISO() });
    const start = el('input.input', { type: 'time', value: predvolene.startTime ?? '16:00' });
    const end = el('input.input', { type: 'time', value: predvolene.endTime ?? '17:30' });
    const group = selectInput(sortedGroups().map((g) => ({ value: g.id, label: g.name })), { value: predvolene.groupId });
    const trainerSel = selectInput(db.trainers.map((t) => ({ value: t.id, label: t.name })), { value: predvolene.trainerId ?? trainer.id });
    const tema = poleTema();

    mount(body,
      el('p.small.muted', { style: { margin: 0 }, text: 'Pre tréning, ktorý ste zabudli zapísať. Dochádzku žiakov doplníte hneď na ďalšej obrazovke.' }),
      field('Dátum', date),
      el('div.grid2', {}, field('Začiatok', start), field('Koniec', end)),
      field('Skupina', group),
      field('Tréner', trainerSel),
      field('Téma tréningu (nepovinné)', tema.node),
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
            note: tema.input.value.trim(),
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
