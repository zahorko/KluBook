/* =========================================================
   Platby — mesačný stav zaplatené / nezaplatené (ručná evidencia)
   ========================================================= */
import { el, clear, mount, toast, fmtPeriod, shiftPeriod, downloadCSV, sheet, field } from '../ui.js';
import {
  db, sortedGroups, studentsOfGroup, paymentStatus, paymentFor,
  togglePayment, setPayment, todayISO, periodOf, saveNow,
} from '../store.js';
import { refresh } from '../router.js';

const uiState = { period: periodOf(todayISO()) };

export function renderPayments(root) {
  const period = uiState.period;
  const groups = sortedGroups();

  const fee = db.settings.fee;
  const body = el('div.stack-lg');

  const numPaid = el('div.stat__num');
  const numCollected = el('div.stat__num');
  const numMissing = el('div.stat__num');
  const barFill = el('div.bar__fill.bar__fill--good');

  /** Súhrn hore sa prepočíta po každej zmene platby. */
  const paintSummary = () => {
    let paidTotal = 0;
    let allTotal = 0;
    for (const g of groups) {
      for (const s of studentsOfGroup(g.id)) {
        allTotal++;
        if (paymentStatus(s.id, period) === 'paid') paidTotal++;
      }
    }
    numPaid.textContent = `${paidTotal}/${allTotal}`;
    numCollected.textContent = `${paidTotal * fee} €`;
    numMissing.textContent = `${(allTotal - paidTotal) * fee} €`;
    barFill.style.width = `${allTotal ? (paidTotal / allTotal) * 100 : 0}%`;
  };
  paintSummary();

  body.append(
    el('div.card.card--warm.stack', {},
      el('div.row.row--between', {},
        el('button.iconbtn', { text: '‹', onclick: () => { uiState.period = shiftPeriod(period, -1); refresh(); } }),
        el('h2', { text: fmtPeriod(period), style: { fontSize: '18px' } }),
        el('button.iconbtn', {
          text: '›',
          disabled: period >= periodOf(todayISO()),
          onclick: () => { uiState.period = shiftPeriod(period, 1); refresh(); },
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
    const students = studentsOfGroup(g.id);
    if (!students.length) continue;
    const listBox = el('div.card.card--flush.list');

    const paintRows = () => {
      mount(listBox, students.map((s) => {
        const st = paymentStatus(s.id, period);
        const rec = paymentFor(s.id, period);
        const row = el('div.item', {},
          el('span.grow', {},
            el('div.item__title', { text: s.name }),
            el('div.item__sub', {
              text: st === 'paid' && rec?.paidDate ? `zaplatené ${rec.paidDate.split('-').reverse().join('. ')}` : 'čaká na úhradu',
            }),
          ),
          el('button', {
            class: `btn btn--sm ${st === 'paid' ? 'btn--soft' : 'btn--ghost'}`,
            style: st === 'paid'
              ? { background: 'var(--green-l)', color: 'var(--green)' }
              : { background: 'var(--red-l)', color: 'var(--red)', borderColor: 'transparent' },
            text: st === 'paid' ? '✓ Zaplatené' : '✕ Nezaplatené',
            onclick: () => { togglePayment(s.id, period); paintRows(); paintSummary(); },
          }),
        );
        row.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          detailSheet(s, period, () => { paintRows(); paintSummary(); });
        });
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
            for (const s of students) setPayment(s.id, period, 'paid', { amount: fee, paidDate: todayISO() });
            toast(`${g.name}: označené ako zaplatené`);
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
    el('p.tiny.faint.center', { text: 'Podržaním (pravým tlačidlom) na žiakovi upravíte sumu a dátum úhrady.' }),
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
    const amount = el('input.input', { type: 'number', step: '0.5', value: rec?.amount ?? db.settings.fee });
    const paidDate = el('input.input', { type: 'date', value: rec?.paidDate ?? todayISO() });
    const note = el('input.input', { type: 'text', value: rec?.note ?? '', placeholder: 'napr. zaplatené naraz za 3 mesiace' });

    box.append(
      field('Stav', status),
      el('div.grid2', {}, field('Suma (€)', amount), field('Dátum úhrady', paidDate)),
      field('Poznámka', note),
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
  const rows = [['Skupina', 'Žiak', 'Obdobie', 'Stav', 'Suma', 'Dátum úhrady', 'Poznámka']];
  for (const g of sortedGroups()) {
    for (const s of studentsOfGroup(g.id)) {
      const p = paymentFor(s.id, period);
      rows.push([
        g.name, s.name, period,
        p?.status === 'paid' ? 'zaplatené' : 'nezaplatené',
        p?.amount ?? '', p?.paidDate ?? '', p?.note ?? '',
      ]);
    }
  }
  downloadCSV(`platby-${period}.csv`, rows);
  toast('CSV stiahnuté');
}
