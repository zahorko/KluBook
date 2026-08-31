/* =========================================================
   Platby — 5 € za odtrénovanú hodinu
   ---------------------------------------------------------
   Platba sa zapisuje priamo pri dochádzke, na obrazovke tréningu.
   Táto obrazovka je na to, čo z toho vyplýva: kto ešte dlhuje
   a koľko sa za mesiac vybralo.
   ========================================================= */
import { el, mount, toast, fmtPeriod, fmtDayShort, shiftPeriod, downloadCSV, sheet, field } from '../ui.js';
import {
  db, groupName, todayISO, periodOf, allStudents, primaryGroupId, studentGroupNames,
  studentFee, hasOwnFee, ucetZiaka, pokladna, platbyZiaka,
  vybraneZaTrening, toggleTrainingPaid, sessionsInRange, currentTrainer, studentById,
  pokladnaTrenerov, zapisatOdvod, zrusitOdvod, odvodyTrenera,
} from '../store.js';
import { go, refresh } from '../router.js';
import { ikona } from '../ikony.js';
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
      [['ziaci', 'Podľa žiakov'], ['treningy', 'Podľa tréningov'], ['pokladna', 'Pokladňa']].map(([id, label]) =>
        el('button.pill', {
          text: label,
          'aria-pressed': String(uiState.pohlad === id),
          onclick: () => { uiState.pohlad = id; refresh(); },
        }),
      ),
    ),

    uiState.pohlad === 'ziaci' ? podlaZiakov(obdobie, period)
      : uiState.pohlad === 'treningy' ? podlaTreningov(obdobie)
        : pokladnaSekcia(obdobie),

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
                text: zaznam.paid ? `✓ ${eur(zaznam.paidAmount ?? studentFee(student))} €` : `${eur(studentFee(student))} €`,
              }),
            ),
          )),
        u.dlh && maKontakt(student)
          ? el('button.btn.btn--soft.btn--block', {
            onclick: () => {
              close();
              contactSheet(student, {
                title: 'Pripomienka platby',
                subject: `Tréningy ${fmtPeriod(period)}`,
                text: textPlatba(student, u.nezaplatenych, eur(u.dlh),
                  db.settings.shortName || db.settings.clubName, currentTrainer()?.name ?? ''),
              });
            },
          }, ikona('sprava', { velkost: 16 }), 'Poslať pripomienku rodičovi')
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


/* ---------------- pokladňa ---------------- */
/**
 * Kto koľko hotovosti prevzal a koľko z nej už odovzdal do klubovej pokladne.
 * Appka inak vie len to, koľko sa malo vybrať — nie kde tie peniaze sú.
 */
function pokladnaSekcia(obdobie) {
  const riadky = pokladnaTrenerov(obdobie);
  const spolu = riadky.reduce((a, r) => ({
    prevzal: a.prevzal + r.prevzal, odovzdal: a.odovzdal + r.odovzdal, uSeba: a.uSeba + r.uSeba,
  }), { prevzal: 0, odovzdal: 0, uSeba: 0 });

  if (!riadky.length) {
    return el('div.empty', {},
      el('span.empty__mark', {}, ikona('platby', { velkost: 34 })),
      'V tomto mesiaci sa zatiaľ nevybrala žiadna hotovosť.');
  }

  return el('div.stack-lg', {},
    el('div.card.stack', {},
      el('div.stats', {},
        el('div.stat', {}, el('div.stat__num', { text: `${eur(spolu.prevzal)} €` }), el('div.stat__lab', { text: 'prevzali tréneri' })),
        el('div.stat', {}, el('div.stat__num', { text: `${eur(spolu.odovzdal)} €` }), el('div.stat__lab', { text: 'odovzdané' })),
        el('div.stat', {},
          el('div.stat__num', { style: { color: spolu.uSeba ? 'var(--terracotta-d)' : 'inherit' }, text: `${eur(spolu.uSeba)} €` }),
          el('div.stat__lab', { text: 'ešte u trénerov' })),
      ),
    ),

    el('div', {},
      el('h2.section-title', { text: 'Podľa trénera' }),
      el('div.card.card--flush.list', {}, riadky.map((r) =>
        el('button.item', { onclick: () => odvodSheet(r) },
          el('span.grow', {},
            el('div.item__title', { text: r.meno }),
            el('div.item__sub', { text: `prevzal ${eur(r.prevzal)} € · odovzdal ${eur(r.odovzdal)} €` }),
          ),
          el('span', { style: { textAlign: 'right' } },
            el('div.mono', {
              style: { fontWeight: '700', color: r.uSeba > 0 ? 'var(--terracotta-d)' : 'var(--green)' },
              text: r.uSeba > 0 ? `${eur(r.uSeba)} €` : '✓',
            }),
            el('div.item__sub', { text: r.uSeba > 0 ? 'u seba' : 'vyrovnané' }),
          ),
          el('span.chev', { text: '›' }),
        ),
      )),
      el('p.tiny.faint', { style: { margin: '8px 2px 0' },
        text: 'Peniaze sa pripisujú tomu, kto platbu v appke zapísal. Ťuknutím zapíšete odovzdanie do klubovej pokladne.' }),
    ),
  );
}

function odvodSheet(riadok) {
  sheet(`${riadok.meno} — pokladňa`, (body, close) => {
    const obsah = el('div.stack');
    const vykresli = () => {
      const historia = odvodyTrenera(riadok.trainerId);
      mount(obsah,
        el('div.stats', {},
          el('div.stat', {}, el('div.stat__num', { text: `${eur(riadok.prevzal)} €` }), el('div.stat__lab', { text: 'prevzal' })),
          el('div.stat', {}, el('div.stat__num', { text: `${eur(riadok.odovzdal)} €` }), el('div.stat__lab', { text: 'odovzdal' })),
          el('div.stat', {}, el('div.stat__num', { text: `${eur(riadok.uSeba)} €` }), el('div.stat__lab', { text: 'u seba' })),
        ),
        historia.length
          ? el('div.card.card--flush.list', {}, historia.slice(0, 10).map((o) =>
            el('div.item', {},
              el('span.grow', {},
                el('div.item__title', { text: `${eur(o.amount)} €` }),
                el('div.item__sub', { text: `${fmtDayShort(o.at)}${o.note ? ` · ${o.note}` : ''}` }),
              ),
              el('button.iconbtn', {
                text: '✕', title: 'Zrušiť tento zápis',
                onclick: () => { zrusitOdvod(o.id); toast('Zápis zrušený'); close(); refresh(); },
              }),
            ),
          ))
          : el('p.small.muted', { style: { margin: 0 }, text: 'Zatiaľ nič neodovzdal.' }),
      );
    };
    vykresli();

    const suma = el('input.input', { type: 'number', step: '0.5', min: '0', value: String(Math.max(0, riadok.uSeba)) });
    const datum = el('input.input', { type: 'date', value: todayISO() });
    const poznamka = el('input.input', { type: 'text', placeholder: 'napr. odovzdané pokladníkovi' });

    mount(body,
      obsah,
      el('h2.section-title', { text: 'Zapísať odovzdanie' }),
      el('div.grid2', {}, field('Suma (€)', suma), field('Dátum', datum)),
      field('Poznámka', poznamka),
      el('button.btn.btn--block', {
        text: 'Zapísať',
        onclick: () => {
          try {
            zapisatOdvod({
              trainerId: riadok.trainerId,
              amount: Number(suma.value),
              at: datum.value || todayISO(),
              note: poznamka.value.trim(),
            });
            close();
            toast(`Odovzdaných ${eur(Number(suma.value))} €`);
            refresh();
          } catch (e) { toast(e.message); }
        },
      }),
    );
  });
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
