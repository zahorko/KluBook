/* =========================================================
   Platby — mesačný stav zaplatené / nezaplatené (ručná evidencia)
   ========================================================= */
import { el, clear, mount, toast, fmtPeriod, shiftPeriod, downloadCSV, sheet, field } from '../ui.js';
import {
  db, sortedGroups, studentsOfGroup, paymentStatus, paymentFor,
  togglePayment, setPayment, todayISO, periodOf, saveNow,
  studentFee, paidAmount, hasOwnFee, currentTrainer, allStudents, primaryGroupId,
  studentGroupNames,
} from '../store.js';
import { refresh } from '../router.js';
import { contactSheet, maKontakt, textPlatba } from '../contact.js';

const uiState = { period: periodOf(todayISO()), rucneZvolene: false };

/** Sumy bez zbytočných desatinných miest: 25 €, nie 25.00 €. */
const eur = (n) => (Math.round(n * 100) / 100).toString().replace('.', ',');

export function renderPayments(root) {
  // Kým si tréner mesiac sám neprepne, ukazujeme vždy aktuálny. Po prelome
  // mesiaca sa tak nový mesiac objaví sám aj v appke, ktorá je stále otvorená.
  if (!uiState.rucneZvolene) uiState.period = periodOf(todayISO());
  const period = uiState.period;
  const groups = sortedGroups();

  const body = el('div.stack-lg');

  const numPaid = el('div.stat__num');
  const numCollected = el('div.stat__num');
  const numMissing = el('div.stat__num');
  const barFill = el('div.bar__fill.bar__fill--good');

  /** Súhrn počíta so skutočne zaplatenými sumami, nie s jednou fixnou. */
  const paintSummary = () => {
    let paidTotal = 0;
    let allTotal = 0;
    let vybrane = 0;
    let chyba = 0;
    // allStudents() = každý žiak raz, aj keď chodí do viacerých skupín —
    // inak by sa jeho poplatok počítal dvakrát
    for (const s of allStudents()) {
      allTotal++;
      if (paymentStatus(s.id, period) === 'paid') {
        paidTotal++;
        vybrane += paidAmount(s.id, period);
      } else {
        chyba += studentFee(s);
      }
    }
    numPaid.textContent = `${paidTotal}/${allTotal}`;
    numCollected.textContent = `${eur(vybrane)} €`;
    numMissing.textContent = `${eur(chyba)} €`;
    barFill.style.width = `${allTotal ? (paidTotal / allTotal) * 100 : 0}%`;
  };
  paintSummary();

  body.append(
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
        el('div.stat', {}, numPaid, el('div.stat__lab', { text: 'zaplatených' })),
        el('div.stat', {}, numCollected, el('div.stat__lab', { text: 'vybrané' })),
        el('div.stat', {}, numMissing, el('div.stat__lab', { text: 'chýba' })),
      ),
      el('div.bar', {}, barFill),
    ),
  );

  for (const g of groups) {
    // žiaka ukazujeme pod jeho hlavnou skupinou, nech nie je v zozname dvakrát
    const students = studentsOfGroup(g.id).filter((s) => primaryGroupId(s) === g.id);
    if (!students.length) continue;
    const listBox = el('div.card.card--flush.list');

    const paintRows = () => {
      mount(listBox, students.map((s) => {
        const st = paymentStatus(s.id, period);
        const rec = paymentFor(s.id, period);
        const suma = st === 'paid' ? paidAmount(s.id, period) : studentFee(s);
        const znovu = () => { paintRows(); paintSummary(); };

        const row = el('div.item', {
          style: { cursor: 'pointer' },
          title: 'Ťuknutím upravíte sumu a dátum úhrady',
          onclick: () => detailSheet(s, period, znovu),
        },
          el('span.grow', {},
            el('div.item__title', { text: s.name }),
            el('div.item__sub', {
              text: st === 'paid'
                ? `zaplatené ${rec?.paidDate ? rec.paidDate.split('-').reverse().join('. ') : ''} · ${eur(suma)} €`
                : `čaká na úhradu · ${eur(suma)} €${hasOwnFee(s) ? ' (vlastný)' : ''}`,
            }),
          ),
          el('button', {
            class: `btn btn--sm ${st === 'paid' ? 'btn--soft' : 'btn--ghost'}`,
            style: st === 'paid'
              ? { background: 'var(--green-l)', color: 'var(--green)' }
              : { background: 'var(--red-l)', color: 'var(--red)', borderColor: 'transparent' },
            text: st === 'paid' ? '✓ Zaplatené' : '✕ Nezaplatené',
            onclick: (e) => { e.stopPropagation(); togglePayment(s.id, period); znovu(); },
          }),
        );
        return row;
      }));
    };
    paintRows();

    body.append(el('div', {},
      el('div.row.row--between', { style: { alignItems: 'baseline' } },
        el('h2.section-title', { text: g.name }),
        el('button.btn.btn--ghost.btn--sm', {
          text: 'Všetci zaplatili',
          style: { marginTop: '14px' },
          onclick: () => {
            // Kto už zaplatené má, toho sa nedotkneme — inak by sme mu prepísali
            // zapísanú sumu a dátum úhrady klubovým poplatkom a dneškom.
            const chybajuci = students.filter((s) => paymentStatus(s.id, period) !== 'paid');
            if (!chybajuci.length) { toast(`${g.name}: všetci už zaplatili`); return; }
            for (const s of chybajuci) {
              setPayment(s.id, period, 'paid', { amount: studentFee(s), paidDate: todayISO() });
            }
            toast(`${g.name}: doplnených ${chybajuci.length}`);
            refresh();
          },
        }),
      ),
      listBox,
    ));
  }

  body.append(
    el('button.btn.btn--ghost.btn--block', {
      text: '⤓ Export platieb do CSV',
      onclick: () => exportPayments(period),
    }),
    el('p.tiny.faint.center', { text: 'Ťuknutím na meno žiaka upravíte sumu, dátum úhrady a poznámku.' }),
  );

  mount(root, body);
}

function detailSheet(student, period, after) {
  sheet(`${student.name} — ${fmtPeriod(period)}`, (box, close) => {
    const rec = paymentFor(student.id, period);
    const status = el('select.select', {},
      el('option', { value: 'paid', text: 'Zaplatené', selected: rec?.status === 'paid' }),
      el('option', { value: 'unpaid', text: 'Nezaplatené', selected: rec?.status !== 'paid' }),
    );
    const amount = el('input.input', { type: 'number', step: '0.5', value: rec?.amount ?? studentFee(student) });
    const paidDate = el('input.input', { type: 'date', value: rec?.paidDate ?? todayISO() });
    const note = el('input.input', { type: 'text', value: rec?.note ?? '', placeholder: 'napr. zaplatené naraz za 3 mesiace' });

    mount(box,
      field('Stav', status),
      el('div.grid2', {}, field('Suma (€)', amount), field('Dátum úhrady', paidDate)),
      el('p.tiny.faint', { style: { margin: '-4px 2px 0' },
        text: hasOwnFee(student)
          ? `Predvolená suma tohto žiaka: ${eur(studentFee(student))} € (vlastná, nastavená v karte žiaka).`
          : `Predvolená suma: ${eur(studentFee(student))} € (klubová). Vlastnú sumu žiakovi nastavíte v jeho karte.` }),
      field('Poznámka', note),
      maKontakt(student) && status.value !== 'paid'
        ? el('button.btn.btn--soft.btn--block', {
          text: '💬 Poslať pripomienku rodičovi',
          onclick: () => {
            close();
            contactSheet(student, {
              title: `Pripomienka platby — ${fmtPeriod(period)}`,
              subject: `Členské ${fmtPeriod(period)}`,
              text: textPlatba(student, fmtPeriod(period), eur(Number(amount.value) || studentFee(student)),
                db.settings.shortName || db.settings.clubName, currentTrainer()?.name ?? ''),
            });
          },
        })
        : null,
      el('button.btn.btn--block', {
        text: 'Uložiť',
        style: { marginTop: '8px' },
        onclick: () => {
          const paid = status.value === 'paid';
          setPayment(student.id, period, status.value, {
            amount: paid ? Number(amount.value) : null,
            paidDate: paid ? paidDate.value : null,
            note: note.value.trim(),
          });
          saveNow();
          close();
          toast('Uložené');
          after?.();
        },
      }),
    );
  });
}

function exportPayments(period) {
  const rows = [['Skupiny', 'Žiak', 'Obdobie', 'Stav', 'Suma', 'Dátum úhrady', 'Poznámka']];
  {
    for (const s of allStudents()) {
      const p = paymentFor(s.id, period);
      rows.push([
        studentGroupNames(s).join(' + '), s.name, period,
        p?.status === 'paid' ? 'zaplatené' : 'nezaplatené',
        p?.amount ?? '', p?.paidDate ?? '', p?.note ?? '',
      ]);
    }
  }
  downloadCSV(`platby-${period}.csv`, rows);
  toast('CSV stiahnuté');
}
