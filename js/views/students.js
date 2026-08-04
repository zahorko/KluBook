/* =========================================================
   Žiaci — zoznam podľa skupín, pridať/upraviť/vymazať, detail
   ========================================================= */
import {
  el, clear, mount, toast, sheet, confirmSheet, field, textInput, selectInput,
  fmtDate, fmtDayShort, fmtPeriod,
} from '../ui.js';
import {
  db, sortedGroups, groupName, studentsOfGroup, upsertStudent, deleteStudent, studentById,
  paymentStatus, togglePayment, todayISO, periodOf, updateStudent,
  studentFee, hasOwnFee, periodsUpToNow, trackingSince,
  absenceStreak, ABSENCE_ALERT, markContacted, currentTrainer,
} from '../store.js';
import { go, refresh } from '../router.js';
import { contactSheet, telHref, maKontakt, textVymeskavanie } from '../contact.js';

const uiState = { groupId: null, query: '' };

export function renderStudents(root) {
  if (!uiState.groupId) uiState.groupId = sortedGroups()[0].id;

  const search = textInput({
    placeholder: 'Hľadať žiaka…',
    value: uiState.query,
    oninput: (e) => { uiState.query = e.target.value; paintList(); },
  });

  const listBox = el('div');

  const paintList = () => {
    const q = uiState.query.trim().toLowerCase();
    const students = q
      ? db.students.filter((s) => s.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'sk'))
      : studentsOfGroup(uiState.groupId, { includeInactive: true });

    const period = periodOf(todayISO());

    mount(listBox, 
      students.length === 0
        ? el('div.empty', {}, el('span.empty__mark', { text: '♟' }), 'Žiadni žiaci. Pridajte prvého tlačidlom nižšie.')
        : el('div.card.card--flush.list', {},
          students.map((s) => {
            const pay = paymentStatus(s.id, period);
            const vymeska = absenceStreak(s.id).count;
            return el('button.item', { onclick: () => go(`/ziaci/${s.id}`) },
              el('span', { class: `dot dot--${pay === 'paid' ? 'paid' : 'unpaid'}` }),
              el('span.grow', {},
                el('div.item__title', {}, s.name,
                  s.active ? null : el('span.tag', { text: 'neaktívny', style: { marginLeft: '8px' } }),
                  vymeska >= ABSENCE_ALERT
                    ? el('span.tag.tag--unpaid', { text: `chýba ${vymeska}×`, style: { marginLeft: '8px' } })
                    : null),
                el('div.item__sub', { text: q ? groupName(s.groupId) : (s.contactPhone || s.contactName || '—') }),
              ),
              el('span.chev', { text: '›' }),
            );
          }),
        ),
    );
  };

  paintList();

  mount(root, el('div.stack-lg', {},
    el('div.stack', {},
      el('div.pillbar', {},
        sortedGroups().map((g) =>
          el('button.pill', {
            text: `${g.name} · ${studentsOfGroup(g.id).length}`,
            'aria-pressed': String(g.id === uiState.groupId && !uiState.query),
            onclick: () => { uiState.groupId = g.id; uiState.query = ''; search.value = ''; refresh(); },
          }),
        ),
      ),
      search,
      listBox,
    ),
    el('button.btn.btn--block', {
      text: '＋ Pridať žiaka',
      onclick: () => studentSheet(null, uiState.groupId),
    }),
  ));
}

/* ---------------- detail žiaka ---------------- */
export function renderStudentDetail(root, studentId) {
  const s = studentById(studentId);
  if (!s) { mount(root, el('div.empty', { text: 'Žiak sa nenašiel.' })); return; }

  // od nástupu žiaka (nie skôr, než klub eviduje platby) po dnešok
  const zaciatok = [periodOf(s.startDate), trackingSince()].sort().at(-1);
  const periods = periodsUpToNow(zaciatok, 12);
  // História sa viaže na dochádzku, nie na aktuálnu skupinu — inak by žiakovi
  // po prechode medzi skupinami zmizli všetky staršie tréningy aj percento účasti.
  const attMap = new Map(db.attendance.filter((a) => a.studentId === s.id).map((a) => [a.sessionId, a]));
  const relevant = db.sessions
    .filter((x) => attMap.has(x.id))
    .sort((a, b) => b.date.localeCompare(a.date));
  const presentCount = relevant.filter((x) => attMap.get(x.id).present).length;
  const rate = relevant.length ? Math.round((presentCount / relevant.length) * 100) : 0;

  const payBox = el('div.row.wrap', { style: { gap: '6px' } });
  const paintPay = () => {
    mount(payBox, 
      periods.map((p) => {
        const st = paymentStatus(s.id, p);
        return el('button', {
          class: `paycell paycell--${st === 'paid' ? 'paid' : 'unpaid'}`,
          style: { minWidth: '58px' },
          text: `${p.slice(5)}/${p.slice(2, 4)}`,
          title: `${fmtPeriod(p)} — ${st === 'paid' ? 'zaplatené' : 'nezaplatené'} (ťuknutím prepnete)`,
          onclick: () => { togglePayment(s.id, p); paintPay(); },
        });
      }),
    );
  };
  paintPay();

  mount(root, el('div.stack-lg', {},
    el('div.card.card--warm', {},
      el('div.row', {},
        el('span.avatar.avatar--ghost', { text: initials(s.name) }),
        el('span.grow', {},
          el('h2', { text: s.name, style: { fontSize: '20px' } }),
          el('div.small.muted', { text: groupName(s.groupId) }),
        ),
      ),
      el('div.small.muted', { style: { marginTop: '12px' } },
        el('div', {}, `Kontakt: ${s.contactName || '—'}`,
          s.contactPhone
            ? el('a', { href: telHref(s.contactPhone), style: { marginLeft: '6px' } }, ` · ${s.contactPhone}`)
            : null),
        s.contactEmail ? el('div', {}, el('a', { href: `mailto:${s.contactEmail}` }, s.contactEmail)) : null,
        el('div', { text: `V klube od: ${fmtDate(s.startDate)}` }),
        el('div', {
          text: `Mesačný poplatok: ${studentFee(s)} €${hasOwnFee(s) ? ' (vlastný)' : ' (klubový)'}`,
        }),
        s.note ? el('div', { style: { marginTop: '6px', fontStyle: 'italic' }, text: s.note }) : null,
      ),
      maKontakt(s)
        ? el('div.row', { style: { gap: '10px', marginTop: '14px' } },
          s.contactPhone
            ? el('a.btn.btn--sm.grow', { href: telHref(s.contactPhone), style: { textDecoration: 'none' } }, '📞 Zavolať')
            : null,
          el('button.btn.btn--soft.btn--sm.grow', {
            text: '💬 Napísať',
            onclick: () => contactSheet(s, {
              title: `Napísať — ${s.contactName || s.name}`,
              text: textVymeskavanie(s, db.settings.shortName || db.settings.clubName, currentTrainer()?.name ?? ''),
            }),
          }),
        )
        : null,
      el('div.row', { style: { gap: '10px', marginTop: '14px' } },
        el('button.btn.btn--soft.btn--sm.grow', { text: 'Upraviť', onclick: () => studentSheet(s) }),
        el('button.btn.btn--ghost.btn--sm', {
          text: s.active ? 'Deaktivovať' : 'Aktivovať',
          onclick: () => {
            s.active = !s.active;
            updateStudent(s);
            toast(s.active ? 'Žiak je aktívny' : 'Žiak je neaktívny');
            refresh();
          },
        }),
      ),
    ),

    el('div', {},
      el('h2.section-title', { text: 'Dochádzka' }),
      el('div.stats', {},
        el('div.stat', {}, el('div.stat__num', { text: String(relevant.length) }), el('div.stat__lab', { text: 'tréningov' })),
        el('div.stat', {}, el('div.stat__num', { text: String(presentCount) }), el('div.stat__lab', { text: 'prítomný' })),
        el('div.stat', {}, el('div.stat__num', { text: `${rate}%` }), el('div.stat__lab', { text: 'účasť' })),
      ),
      el('div.bar', { style: { marginTop: '10px' } },
        el('div', { class: `bar__fill${rate >= 75 ? ' bar__fill--good' : ''}`, style: { width: `${rate}%` } }),
      ),
    ),

    el('div', {},
      el('h2.section-title', { text: 'Platby' }),
      el('div.card', {},
        payBox,
        el('p.tiny.faint', { style: { marginBottom: 0 }, text: 'Ťuknutím prepnete zaplatené / nezaplatené.' }),
      ),
    ),

    el('div', {},
      el('h2.section-title', { text: 'História tréningov' }),
      relevant.length === 0
        ? el('div.empty', { text: 'Zatiaľ žiadne záznamy.' })
        : el('div.card.card--flush.list', {},
          relevant.slice(0, 20).map((x) => {
            const present = attMap.get(x.id).present;
            return el('div.item', {},
              el('span.grow', {},
                el('div.item__title', { text: fmtDayShort(x.date) }),
                el('div.item__sub', { text: `${x.startTime}–${x.endTime ?? '…'}` }),
              ),
              el('span', { class: `tag tag--${present ? 'paid' : 'unpaid'}`, text: present ? 'prítomný' : 'chýbal' }),
            );
          }),
        ),
    ),

    el('button.btn.btn--danger.btn--block', {
      text: 'Vymazať žiaka',
      onclick: async () => {
        const ok = await confirmSheet('Vymazať žiaka?',
          `${s.name} sa vymaže vrátane dochádzky a platieb. Ak chcete zachovať históriu, použite radšej „Deaktivovať".`,
          { danger: true, okLabel: 'Vymazať' });
        if (!ok) return;
        deleteStudent(s.id);
        toast('Žiak vymazaný');
        go('/ziaci');
      },
    }),
  ));
}

/* ---------------- formulár žiaka ---------------- */
export function studentSheet(student, defaultGroupId) {
  const isNew = !student;
  sheet(isNew ? 'Nový žiak' : 'Upraviť žiaka', (body, close) => {
    const name = textInput({ value: student?.name ?? '', placeholder: 'Meno a priezvisko' });
    const group = selectInput(sortedGroups().map((g) => ({ value: g.id, label: g.name })), {
      value: student?.groupId ?? defaultGroupId ?? sortedGroups()[0].id,
    });
    const contactName = textInput({ value: student?.contactName ?? '', placeholder: 'Meno rodiča / žiaka' });
    const phone = el('input.input', { type: 'tel', value: student?.contactPhone ?? '', placeholder: '0900 000 000' });
    const email = el('input.input', { type: 'email', value: student?.contactEmail ?? '', placeholder: 'nepovinné' });
    const start = el('input.input', { type: 'date', value: student?.startDate ?? todayISO() });
    const fee = el('input.input', {
      type: 'number', step: '0.5', min: '0',
      value: student?.monthlyFee ?? '',
      placeholder: `klubový poplatok (${db.settings.fee} €)`,
    });
    const note = el('textarea.textarea', { placeholder: 'napr. hrá za mládežnícky tím' }, student?.note ?? '');

    mount(body,
      field('Meno *', name),
      field('Skupina', group),
      field('Kontaktná osoba', contactName),
      el('div.grid2', {}, field('Telefón', phone), field('E-mail', email)),
      el('div.grid2', {}, field('Dátum nástupu', start), field('Mesačný poplatok (€)', fee)),
      el('p.tiny.faint', { style: { margin: '-4px 2px 0' },
        text: `Prázdne = platí klubový poplatok ${db.settings.fee} €. Vyplňte, len ak má tento žiak inú sumu.` }),
      field('Poznámka', note),
      el('button.btn.btn--block', {
        text: isNew ? 'Pridať žiaka' : 'Uložiť zmeny',
        style: { marginTop: '8px' },
        onclick: () => {
          if (!name.value.trim()) { toast('Zadajte meno žiaka'); return; }
          upsertStudent({
            id: student?.id,
            name: name.value.trim(),
            groupId: group.value,
            contactName: contactName.value.trim(),
            contactPhone: phone.value.trim(),
            contactEmail: email.value.trim(),
            startDate: start.value || todayISO(),
            monthlyFee: fee.value === '' ? null : Number(fee.value),
            note: note.value.trim(),
            active: student?.active ?? true,
          });
          close();
          toast(isNew ? 'Žiak pridaný' : 'Uložené');
          refresh();
        },
      }),
    );
  });
}

const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
