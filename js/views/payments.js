/* =========================================================
   Platby — 5 € za odtrénovanú hodinu
   ---------------------------------------------------------
   Platba sa zapisuje priamo pri dochádzke, na obrazovke tréningu.
   Táto obrazovka je na to, čo z toho vyplýva: kto ešte dlhuje
   a koľko sa za mesiac vybralo.
   ========================================================= */
import { el, mount, toast, fmtPeriod, fmtDayShort, shiftPeriod, downloadCSV, sheet } from '../ui.js';
import {
  db, groupName, todayISO, periodOf, allStudents, primaryGroupId, studentGroupNames,
  studentFee, hasOwnFee, ucetZiaka, dlznici, pokladna, platbyZiaka,
  vybraneZaTrening, toggleTrainingPaid, sessionsInRange, currentTrainer, studentById,
} from '../store.js';
import { go, refresh } from '../router.js';
import { contactSheet, maKontakt, textPlatba } from '../contact.js';

const uiState = { period: periodOf(todayISO()), rucneZvolene: false, pohlad: 'ziaci' };

const eur = (n) => (Math.round((Number(n) || 0) * 100) / 100).toString().replace('.', ',');

/** Prvý a posledný deň mesiaca — platby sledujeme po mesiacoch, aj keď sa platí po tréningoch. */
const rozsahMesiaca = (period) => {
  const [y, m] = period.split('-').map(Number);
  const posledny = new Date(y, m, 0).getDate();
  return { from: `${period}-01`, to: `${period}-${String(posledny).padStart(2, '0')}` };
};

export function renderPayments(root) {
  // kým si tréner mesiac sám neprepne, ukazujeme vždy aktuálny
  if (!uiState.rucneZvolene) uiState.period = periodOf(todayISO());
  const period = uiState.period;
  const obdobie = rozsahMesiaca(period);
  const kasa = pokladna(obdobie);

  mount(root, el('div.stack-lg', {},
    el('div.card.card--warm.stack', {},
      el('div.row.row--between', {},
        el('button.iconbtn', { text: '‹', onclick: () => { uiState.period = shiftPeriod(period, -1); uiState.rucneZvolene = true; refresh(); } }),
        el('h2', { text: fmtPeriod(period), style: { fontSize: '18px' } }),
        el('button.iconbtn', {
          text: '›',
          disabled: period >= periodOf(todayISO()),
          onclick: () => { uiState.period = shiftPeriod(period, 1); uiState.rucneZvolene = true; refresh(); },
        }),
      ),
      el('div.stats', {},
        el('div.stat', {}, el('div.stat__num', { text: `${eur(kasa.vybrane)} €` }), el('div.stat__lab', { text: 'vybraté' })),
        el('div.stat', {}, el('div.stat__num', { text: `${eur(kasa.dlh)} €` }), el('div.stat__lab', { text: 'chýba' })),
        el('div.stat', {}, el('div.stat__num', { text: `${kasa.zaplatenych}/${kasa.treningov}` }), el('div.stat__lab', { text: 'zaplatených hodín' })),
      ),
    ),

    el('div.pillbar', {},
      [['ziaci', 'Podľa žiakov'], ['treningy', 'Podľa tréningov']].map(([id, label]) =>
        el('button.pill', {
          text: label,
          'aria-pressed': String(uiState.pohlad === id),
          onclick: () => { uiState.pohlad = id; refresh(); },
        }),
      ),
    ),

    uiState.pohlad === 'ziaci' ? podlaZiakov(obdobie, period) : podlaTreningov(obdobie),

    el('button.btn.btn--ghost.btn--block', { text: '⤓ Export do CSV', onclick: () => exportPlatby(period, obdobie) }),
  ));
}

/* ---------------- podľa žiakov ---------------- */
function podlaZiakov(obdobie, period) {
  const riadky = allStudents()
    .map((s) => ({ student: s, ...ucetZiaka(s.id, obdobie) }))
    .filter((r) => r.treningov > 0);

  if (!riadky.length) {
    return el('div.empty', {},
      el('span.empty__mark', { text: '€' }),
      'V tomto mesiaci zatiaľ nikto nebol na tréningu, takže niet čo platiť.');
  }

  const dlzni = riadky.filter((r) => r.dlh > 0).sort((a, b) => b.dlh - a.dlh);
  const vyrovnani = riadky.filter((r) => r.dlh === 0);

  const riadok = (r) => el('button.item', { onclick: () => ziakSheet(r.student, obdobie, period) },
    el('span.grow', {},
      el('div.item__title', { text: r.student.name }),
      el('div.item__sub', {
        text: `${r.zaplatenych}/${r.treningov} zaplatených`
          + (hasOwnFee(r.student) ? ` · ${eur(studentFee(r.student))} €/tréning` : ''),
      }),
    ),
    el('span', { style: { textAlign: 'right' } },
      el('div.mono', {
        style: { fontWeight: '700', color: r.dlh ? 'var(--red)' : 'var(--green)' },
        text: r.dlh ? `${eur(r.dlh)} €` : '✓',
      }),
      r.dlh ? el('div.item__sub', { text: 'dlhuje' }) : null,
    ),
    el('span.chev', { text: '›' }),
  );

  return el('div.stack-lg', {},
    dlzni.length
      ? el('div', {},
        el('h2.section-title', { text: `Dlhujú · ${dlzni.length}` }),
        el('div.card.card--flush.list', {}, dlzni.map(riadok)),
      )
      : el('div.card', { style: { background: 'var(--green-l)', borderColor: 'transparent' } },
        el('div', { style: { fontWeight: '600', color: 'var(--green)' }, text: '✓ Všetci zaplatili' })),
    vyrovnani.length
      ? el('div', {},
        el('h2.section-title', { text: `Vyrovnaní · ${vyrovnani.length}` }),
        el('div.card.card--flush.list', { style: { opacity: '.75' } }, vyrovnani.map(riadok)),
      )
      : null,
  );
}

/** Tréningy jedného žiaka — tu sa dá platba doklikať aj spätne. */
function ziakSheet(student, obdobie, period) {
  sheet(`${student.name} — ${fmtPeriod(period)}`, (body, close) => {
    const obsah = el('div.stack');

    const vykresli = () => {
      const zoznam = platbyZiaka(student.id, obdobie);
      const u = ucetZiaka(student.id, obdobie);
      mount(obsah,
        el('div.stats', {},
          el('div.stat', {}, el('div.stat__num', { text: String(u.treningov) }), el('div.stat__lab', { text: 'tréningov' })),
          el('div.stat', {}, el('div.stat__num', { text: `${eur(u.vybrane)} €` }), el('div.stat__lab', { text: 'zaplatil' })),
          el('div.stat', {}, el('div.stat__num', { style: { color: u.dlh ? 'var(--red)' : 'inherit' }, text: `${eur(u.dlh)} €` }), el('div.stat__lab', { text: 'dlhuje' })),
        ),
        zoznam.length === 0
          ? el('div.empty', { text: 'V tomto mesiaci nebol na žiadnom tréningu.' })
          : el('div.card.card--flush.list', {}, zoznam.map(({ zaznam, trening }) =>
            el('button.item', {
              onclick: () => { toggleTrainingPaid(trening.id, student.id); vykresli(); },
            },
              el('span.grow', {},
                el('div.item__title', { text: `${fmtDayShort(trening.date)} · ${groupName(trening.groupId)}` }),
                el('div.item__sub', { text: trening.note || `${trening.startTime}–${trening.endTime ?? '…'}` }),
              ),
              el('span', {
                class: `att__euro${zaznam.paid ? ' att__euro--paid' : ''}`,
                text: zaznam.paid ? `✓ ${eur(zaznam.paidAmount ?? studentFee(student))}` : `${eur(studentFee(student))} €`,
              }),
            ),
          )),
        u.dlh && maKontakt(student)
          ? el('button.btn.btn--soft.btn--block', {
            text: '💬 Poslať pripomienku rodičovi',
            onclick: () => {
              close();
              contactSheet(student, {
                title: 'Pripomienka platby',
                subject: `Tréningy ${fmtPeriod(period)}`,
                text: textPlatba(student, u.nezaplatenych, eur(u.dlh),
                  db.settings.shortName || db.settings.clubName, currentTrainer()?.name ?? ''),
              });
            },
          })
          : null,
      );
    };
    vykresli();

    mount(body,
      el('p.small.muted', { style: { margin: 0 }, text: 'Ťuknutím na tréning prepnete, či zaň zaplatil.' }),
      obsah,
    );
  });
}

/* ---------------- podľa tréningov ---------------- */
function podlaTreningov(obdobie) {
  const treningy = sessionsInRange(obdobie.from, obdobie.to);
  if (!treningy.length) return el('div.empty', { text: 'V tomto mesiaci zatiaľ nie sú žiadne tréningy.' });

  return el('div', {},
    el('h2.section-title', { text: 'Tréningy mesiaca' }),
    el('div.card.card--flush.list', {}, treningy.map((t) => {
      const k = vybraneZaTrening(t.id);
      return el('button.item', { onclick: () => go(`/trening/${t.id}`) },
        el('span.grow', {},
          el('div.item__title', { text: `${fmtDayShort(t.date)} · ${groupName(t.groupId)}` }),
          el('div.item__sub', { text: `${k.zaplatili}/${k.mali} zaplatilo` + (k.chyba ? ` · chýba ${eur(k.chyba)} €` : '') }),
        ),
        el('span', { style: { textAlign: 'right' } },
          el('div.mono', { style: { fontWeight: '700' }, text: `${eur(k.vybrane)} €` }),
        ),
        el('span.chev', { text: '›' }),
      );
    })),
  );
}

function exportPlatby(period, obdobie) {
  const rows = [['Skupiny', 'Žiak', 'Obdobie', 'Tréningov', 'Zaplatených', 'Vybraté €', 'Dlhuje €']];
  for (const s of allStudents()) {
    const u = ucetZiaka(s.id, obdobie);
    if (!u.treningov) continue;
    rows.push([studentGroupNames(s).join(' + '), s.name, period, u.treningov, u.zaplatenych, u.vybrane, u.dlh]);
  }
  downloadCSV(`platby-${period}.csv`, rows);
  toast('CSV stiahnuté');
}
