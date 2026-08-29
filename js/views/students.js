/* =========================================================
   Žiaci — zoznam podľa skupín, pridať/upraviť/vymazať, detail
   ========================================================= */
import {
  el, clear, mount, toast, sheet, confirmSheet, field, textInput, selectInput,
  fmtDate, fmtDayShort, fmtPeriod, fmtHours, skopirovat,
} from '../ui.js';
import {
  db, sortedGroups, groupName, studentsOfGroup, upsertStudent, deleteStudent, studentById,
  todayISO, periodOf, updateStudent,
  studentFee, hasOwnFee, ucetZiaka, platbyZiaka, toggleTrainingPaid,
  ospravedlnit, zrusitOspravedlnenie, absencie, anonymizovatZiaka,
  prepojitSoZvazom, odpojitOdZvazu, historiaRatingu, posunRatingu, obnovitElo,
  absenceStreak, ABSENCE_ALERT, markContacted, currentTrainer, trainsWithClub, everyone, allStudents,
  studentGroupIds, studentGroupNames, durationMinutes,
  studentEvents, studentPointsSummary, studentEventsOutsideSeason, seasonRange, DRUHY_PODUJATI,
  hracskyProfil, gamifikacia, shopItems, kupit, purchasesOfStudent, zrusitNakup,
} from '../store.js';
import { go, refresh } from '../router.js';
import {
  contactSheet, telHref, maKontakt, textVymeskavanie,
  mailtoHromadne, SABLONY, cistecislo,
} from '../contact.js';
import { sklonuj } from './training.js';
import { najdiVMatrike } from '../api.js';

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
      : uiState.groupId === 'netrenuju'
        ? everyone({ includeInactive: true }).filter((s2) => !trainsWithClub(s2))
        : studentsOfGroup(uiState.groupId, { includeInactive: true });

    const period = periodOf(todayISO());

    // Archivovaných dávame nabok — inak nesedí počet pri názve skupiny
    // so zoznamom pod ním a tréner zbytočne prepočítava.
    const aktivni = students.filter((s) => s.active);
    const archivovani = students.filter((s) => !s.active);

    const riadok = (s) => {
      // kto nechodí na tréningy, neplatí nič — nesmie svietiť ako dlžník
      const platiClenske = trainsWithClub(s);
      const dlh = platiClenske ? ucetZiaka(s.id).dlh : 0;
      const vymeska = absenceStreak(s.id).count;
      return el('button.item', { onclick: () => go(`/ziaci/${s.id}`) },
        el('span', {
          class: `dot dot--${!platiClenske ? 'none' : dlh ? 'unpaid' : 'paid'}`,
          title: !platiClenske ? 'Neplatí — nechodí na tréningy'
            : (dlh ? `Dlhuje ${dlh} €` : 'Nič nedlhuje'),
        }),
        el('span.grow', {},
          el('div.item__title', {}, s.name,
            vymeska >= ABSENCE_ALERT
              ? el('span.tag.tag--unpaid', { text: `chýba ${vymeska}×`, style: { marginLeft: '8px' } })
              : null),
          el('div.item__sub', { text: q ? groupName(s.groupId) : (s.contactPhone || s.contactName || '—') }),
        ),
        el('span.chev', { text: '›' }),
      );
    };

    mount(listBox,
      students.length === 0
        ? el('div.empty', {}, el('span.empty__mark', { text: '♟' }), 'Žiadni žiaci. Pridajte prvého tlačidlom nižšie.')
        : el('div.stack', {},
          aktivni.length ? el('div.card.card--flush.list', {}, aktivni.map(riadok)) : null,
          archivovani.length
            ? el('div', {},
              el('h2.section-title', { text: `Neaktívni · ${archivovani.length}` }),
              el('div.card.card--flush.list', { style: { opacity: '.65' } }, archivovani.map(riadok)),
            )
            : null,
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
        (() => {
          const netrenuju = everyone({ includeInactive: true }).filter((s2) => !trainsWithClub(s2));
          return netrenuju.length
            ? el('button.pill', {
              text: `Netrénujú · ${netrenuju.length}`,
              'aria-pressed': String(uiState.groupId === 'netrenuju' && !uiState.query),
              onclick: () => { uiState.groupId = 'netrenuju'; uiState.query = ''; search.value = ''; refresh(); },
            })
            : null;
        })(),
      ),
      search,
      listBox,
    ),
    el('div.row', { style: { gap: '10px' } },
      el('button.btn.grow', {
        text: '＋ Pridať žiaka',
        onclick: () => studentSheet(null, uiState.groupId),
      }),
      el('button.btn.btn--soft', {
        text: '✉️ Rodičom',
        title: 'Napísať naraz rodičom celej skupiny',
        onclick: () => hromadnaSpravaSheet(),
      }),
    ),
  ));
}

/**
 * Správa rodičom celej skupiny naraz. Appka nič neodosiela — pripraví text
 * a odovzdá ho mailovej aplikácii. Adresy ide do skrytej kópie, aby rodičia
 * nevideli kontakty jeden na druhého.
 */
function hromadnaSpravaSheet() {
  sheet('Správa rodičom', (body, close) => {
    const stav = { groupId: uiState.groupId === 'netrenuju' ? null : uiState.groupId, sablona: 'odpada' };
    const obsah = el('div.stack');

    const prijemcovia = () => {
      const zoznam = stav.groupId
        ? studentsOfGroup(stav.groupId)
        : allStudents();
      return {
        vsetci: zoznam,
        sEmailom: zoznam.filter((x) => x.contactEmail?.trim()),
        sTelefonom: zoznam.filter((x) => x.contactPhone?.trim()),
        bezKontaktu: zoznam.filter((x) => !maKontakt(x)),
      };
    };

    const sprava = el('textarea.textarea', { style: { minHeight: '150px' } });
    const predmet = textInput({ placeholder: 'Predmet e-mailu' });

    const naplnSablonu = () => {
      const s2 = SABLONY.find((x) => x.id === stav.sablona);
      const udaje = {
        klub: db.settings.shortName || db.settings.clubName,
        trener: currentTrainer()?.name ?? '',
        skupina: stav.groupId ? groupName(stav.groupId) : '',
      };
      sprava.value = s2.text(udaje);
      predmet.value = s2.predmet;
    };

    const vykresli = () => {
      const p = prijemcovia();
      mount(obsah,
        el('div.pillbar', {},
          el('button.pill', {
            text: 'Všetci', 'aria-pressed': String(!stav.groupId),
            onclick: () => { stav.groupId = null; vykresli(); },
          }),
          sortedGroups().map((g) => el('button.pill', {
            text: g.name, 'aria-pressed': String(stav.groupId === g.id),
            onclick: () => { stav.groupId = g.id; naplnSablonu(); vykresli(); },
          })),
        ),
        el('div.card.stack', { style: { background: 'var(--cream-deep)', borderColor: 'transparent', gap: '4px' } },
          el('div', { style: { fontWeight: '600' },
            text: `${p.vsetci.length} ${sklonuj(p.vsetci.length, 'žiak', 'žiaci', 'žiakov')} · `
              + `${p.sEmailom.length} s e-mailom · ${p.sTelefonom.length} s telefónom` }),
          p.bezKontaktu.length
            ? el('div.tiny', { style: { color: 'var(--red)' },
              text: `Bez kontaktu: ${p.bezKontaktu.map((x) => x.name).join(', ')}` })
            : el('div.tiny.faint', { text: 'Všetci majú vyplnený kontakt.' }),
        ),
      );
    };

    naplnSablonu();
    vykresli();

    mount(body,
      obsah,
      el('div.pillbar', {}, SABLONY.map((x) => el('button.pill', {
        text: x.nazov, 'aria-pressed': String(stav.sablona === x.id),
        onclick: () => { stav.sablona = x.id; naplnSablonu(); },
      }))),
      field('Predmet', predmet),
      field('Text správy', sprava),

      el('button.btn.btn--block', {
        text: '✉️ Otvoriť e-mail všetkým',
        onclick: () => {
          const emaily = prijemcovia().sEmailom.map((x) => x.contactEmail.trim());
          if (!emaily.length) { toast('Nikto v tomto výbere nemá e-mail'); return; }
          close();
          window.location.href = mailtoHromadne(emaily, predmet.value, sprava.value);
        },
      }),
      el('button.btn.btn--soft.btn--block', {
        text: '📋 Skopírovať telefónne čísla',
        onclick: () => {
          const cisla = prijemcovia().sTelefonom.map((x) => cistecislo(x.contactPhone));
          if (!cisla.length) { toast('Nikto v tomto výbere nemá telefón'); return; }
          skopirovat(cisla.join(', '), `Skopírovaných ${cisla.length} čísel — vložte ich do SMS alebo WhatsAppu`);
        },
      }),
      el('button.btn.btn--ghost.btn--block', {
        text: '📋 Skopírovať text správy',
        onclick: () => skopirovat(sprava.value, 'Text skopírovaný'),
      }),
      el('p.tiny.faint', { style: { margin: 0 },
        text: 'E-mail sa otvorí s adresami v skrytej kópii, takže rodičia nevidia kontakty jeden na druhého. '
          + 'Nič sa neodošle samo — odoslanie potvrdíte vy.' }),
    );
  });
}


/**
 * Level, XP a goldy jedného hráča. Toto je to, čo dieťaťu naozaj ukazujete —
 * nie celé poradie klubu, ale jeho vlastný postup a najbližší cieľ.
 */
function gamifikaciaSekcia(s) {
  const p = hracskyProfil(s.id);
  if (!p) return null;
  const g = gamifikacia();

  const pruh = el('div.bar', { style: { marginTop: '10px' } },
    el('div.bar__fill.bar__fill--good', { style: { width: `${p.postup}%` } }));

  return el('div', {},
    el('h2.section-title', { text: 'Level a goldy' }),
    el('div.card.stack', {},
      el('div.row.row--between', { style: { alignItems: 'baseline' } },
        el('div', {},
          el('div', { style: { fontSize: '26px', fontWeight: '700' }, text: `Level ${p.level}` }),
          el('div.small.muted', { text: `${p.poradie}. v klube tejto sezóny` }),
        ),
        el('div', { style: { textAlign: 'right' } },
          el('div.mono', {
            // mínus môže vzniknúť len po znížení pravidiel — nech to nezapadne
            style: { fontSize: '22px', fontWeight: '700', color: p.gold < 0 ? 'var(--red)' : 'inherit' },
            text: `${p.gold} 💰`,
          }),
          el('div.item__sub', { text: p.gold < 0 ? 'v mínuse' : 'na účte' }),
        ),
      ),
      pruh,
      el('div.row.row--between', {},
        el('span.tiny.faint', { text: `${p.celkovo.xp} XP celkovo · ${p.sezona.xp} XP tejto sezóny` }),
        el('span.tiny.faint', {
          text: p.maxDosiahnuty ? 'najvyšší level' : `do levelu ${p.level + 1} chýba ${p.chyba} XP`,
        }),
      ),
      el('div.stats', { style: { marginTop: '4px' } },
        el('div.stat', {}, el('div.stat__num', { text: String(p.sezona.treningy) }),
          el('div.stat__lab', { text: `tréningov · ${g.xpZaTrening} XP` })),
        el('div.stat', {}, el('div.stat__num', { text: String(p.sezona.podujatia) }),
          el('div.stat__lab', { text: 'podujatí' })),

        el('div.stat', {}, el('div.stat__num', { text: String(p.goldZarobene) }),
          el('div.stat__lab', { text: 'goldov zarobených' })),
      ),
      // séria je najsilnejší ťahák na pravidelnosť — nech ju dieťa vidí
      el('div.row.row--between', {
        style: {
          background: p.sezona.seria ? 'var(--terracotta-l)' : 'var(--cream-deep)',
          borderRadius: 'var(--r-md)', padding: '10px 12px',
        },
      },
        el('span.grow', {},
          el('div', {
            style: { fontWeight: '600', color: p.sezona.seria ? 'var(--terracotta-d)' : 'var(--ink-soft)' },
            text: p.sezona.seria
              ? `🔥 ${p.sezona.seria} ${sklonuj(p.sezona.seria, 'tréning', 'tréningy', 'tréningov')} po sebe`
              : 'Séria zatiaľ nebeží',
          }),
          el('div.tiny.faint', {
            text: p.sezona.seria
              ? `Do ${g.seriaDlzka}. chýba ${(g.seriaDlzka - (p.sezona.seria % g.seriaDlzka)) % g.seriaDlzka || g.seriaDlzka}`
                + ` — potom +${g.seriaBonus} XP`
              : `${g.seriaDlzka} tréningov po sebe = +${g.seriaBonus} XP navyše`,
          }),
        ),
        p.sezona.serie ? el('span.tag', { text: `${p.sezona.serie}× séria` }) : null,
      ),
      el('button.btn.btn--block', {
        text: '💰 Vybrať odmenu z obchodu',
        onclick: () => obchodSheet(s, p),
      }),
    ),
    nakupySekcia(s),
  );
}

/** Čo si dieťa doteraz vybralo — a či to už dostalo do ruky. */
function nakupySekcia(s) {
  const nakupy = purchasesOfStudent(s.id);
  if (!nakupy.length) return null;
  return el('div.card.card--flush.list', { style: { marginTop: '10px' } },
    nakupy.map((n) =>
      el('div.item', {},
        el('span.grow', {},
          el('div.item__title', { text: n.itemName }),
          el('div.item__sub', { text: `${fmtDate(String(n.at).slice(0, 10))} · ${n.price} 💰`
            + (n.delivered ? ' · odovzdané' : ' · čaká na odovzdanie') }),
        ),
        el('button.iconbtn', {
          text: '↩',
          title: 'Zrušiť nákup a vrátiť goldy',
          onclick: async () => {
            const ok = await confirmSheet('Zrušiť nákup?',
              `${n.itemName} sa vymaže z histórie a ${n.price} goldov sa vráti na účet.`,
              { danger: true, okLabel: 'Zrušiť nákup' });
            if (!ok) return;
            zrusitNakup(n.id);
            toast('Nákup zrušený, goldy vrátené');
            refresh();
          },
        }),
      ),
    ),
  );
}

function obchodSheet(s, profil) {
  sheet(`Obchod — ${s.name}`, (body, close) => {
    const ponuka = shopItems();
    mount(body,
      el('div.row.row--between', {},
        el('span.small.muted', { text: 'Zostatok na účte' }),
        el('span.mono', { style: { fontWeight: '700', fontSize: '17px' }, text: `${profil.gold} 💰` }),
      ),
      ponuka.length === 0
        ? el('div.empty', { text: 'Ponuka je zatiaľ prázdna. Odmeny pridáte v Rebríčku → Obchod.' })
        : el('div.card.card--flush.list', {}, ponuka.map((i) => {
          const maNa = profil.gold >= i.price;
          return el(maNa ? 'button.item' : 'div.item', {
            style: maNa ? {} : { opacity: '.45' },
            onclick: maNa ? () => {
              try {
                kupit(s.id, i.id);
                close();
                toast(`${i.name} za ${i.price} 💰`);
                refresh();
              } catch (e) { toast(e.message); }
            } : undefined,
          },
            el('span', { style: { fontSize: '18px', minWidth: '26px', textAlign: 'center' },
              text: i.kind === 'vyhoda' ? '⭐' : '🎁' }),
            el('span.grow', {},
              el('div.item__title', { text: i.name }),
              el('div.item__sub', { text: i.description || '' }),
            ),
            el('span.mono', { style: { fontWeight: '700' }, text: `${i.price} 💰` }),
          );
        })),
    );
  });
}


/**
 * Vopred ohlásené neúčasti. Rodič sa ozve v stredu, tréner to zapíše sem
 * a vo štvrtok už nemusí nič pamätať — dieťa bude v hárku rovno neprítomné
 * a nič sa mu neúčtuje.
 */
function ospravedlneniaSekcia(s) {
  const box = el('div.stack');
  const vykresli = () => {
    const dnes = todayISO();
    const moje = absencie()
      .filter((a) => a.studentId === s.id && a.date >= dnes)
      .sort((a, b) => a.date.localeCompare(b.date));
    mount(box,
      moje.length === 0
        ? el('p.small.muted', { style: { margin: 0 }, text: 'Žiadna ohlásená neúčasť.' })
        : el('div.card.card--flush.list', {}, moje.map((a) =>
          el('div.item', {},
            el('span.grow', {},
              el('div.item__title', { text: fmtDate(a.date) }),
              a.note ? el('div.item__sub', { text: a.note }) : null,
            ),
            el('button.iconbtn', {
              text: '✕', title: 'Zrušiť ospravedlnenie',
              onclick: () => { zrusitOspravedlnenie(s.id, a.date); toast('Zrušené'); vykresli(); },
            }),
          ),
        )),
      el('button.btn.btn--ghost.btn--block', {
        text: '＋ Ohlásiť neúčasť',
        onclick: () => ospravedlnitSheet(s, vykresli),
      }),
    );
  };
  vykresli();
  return el('div', {}, el('h2.section-title', { text: 'Ohlásené neúčasti' }), el('div.card.stack', {}, box));
}

function ospravedlnitSheet(s, hotovo) {
  sheet(`Neúčasť — ${s.name}`, (body, close) => {
    const datum = el('input.input', { type: 'date', value: todayISO() });
    const poznamka = textInput({ placeholder: 'napr. choroba, škola v prírode' });
    mount(body,
      el('p.small.muted', { style: { margin: 0 },
        text: 'V ten deň bude v dochádzke rovno ako neprítomný a nič sa mu neúčtuje. Ak nakoniec príde, stačí ho v hárku prepnúť.' }),
      field('Dátum', datum),
      field('Dôvod (nepovinné)', poznamka),
      el('button.btn.btn--block', {
        text: 'Ohlásiť neúčasť',
        style: { marginTop: '8px' },
        onclick: () => {
          if (!datum.value) { toast('Vyberte dátum'); return; }
          ospravedlnit(s.id, datum.value, poznamka.value.trim());
          close();
          toast(`${s.name}: neúčasť ${fmtDate(datum.value)} zapísaná`);
          hotovo?.();
        },
      }),
    );
  });
}



/**
 * Krivka ELO za sezónu. Rodič sa nepýta na číslo, pýta sa, či to ide hore —
 * a to sa z tvaru čiary prečíta rýchlejšie než zo stĺpca čísel.
 */
function krivkaRatingu(historia) {
  const body = historia.slice(-14);
  const hodnoty = body.map((r) => r.rating);
  const min = Math.min(...hodnoty);
  const max = Math.max(...hodnoty);
  const rozpatie = Math.max(1, max - min);

  const S = 300;      // šírka výkresu
  const V = 74;       // výška
  const okraj = 8;
  const x = (i) => (body.length === 1 ? S / 2 : okraj + (i * (S - 2 * okraj)) / (body.length - 1));
  const y = (h) => V - okraj - ((h - min) / rozpatie) * (V - 2 * okraj);

  const ciara = body.map((r, i) => `${x(i).toFixed(1)},${y(r.rating).toFixed(1)}`).join(' ');
  const vypln = `${okraj},${V - okraj} ${ciara} ${x(body.length - 1).toFixed(1)},${V - okraj}`;
  const stupa = hodnoty.at(-1) >= hodnoty[0];
  const farba = stupa ? 'var(--green)' : 'var(--red)';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${S} ${V}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(V));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `ELO od ${min} do ${max}`);
  svg.innerHTML = `
    <polygon points="${vypln}" fill="${farba}" opacity="0.12" />
    <polyline points="${ciara}" fill="none" stroke="${farba}" stroke-width="2.5"
      stroke-linejoin="round" stroke-linecap="round" />
    ${body.map((r, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(r.rating).toFixed(1)}" r="${i === body.length - 1 ? 4 : 2.5}"
      fill="${farba}" />`).join('')}
  `;

  return el('div', {},
    el('div.row.row--between', {},
      el('span.tiny.faint', { text: `najnižšie ${min}` }),
      el('span.tiny.faint', { text: `najvyššie ${max}` }),
    ),
    el('div', { style: { margin: '2px 0' } }, svg),
    el('div.row.row--between', {},
      el('span.tiny.faint', { text: fmtDate(body[0].at) }),
      el('span.tiny.faint', { text: `${body.length} ${sklonuj(body.length, 'meranie', 'merania', 'meraní')}` }),
      el('span.tiny.faint', { text: fmtDate(body.at(-1).at) }),
    ),
  );
}

/** Matrika vedie mená ako „Priezvisko, Meno" — my ich píšeme naopak. */
export const menoZMatriky = (meno) => {
  const [priezvisko, krstne] = String(meno || '').split(',').map((x) => x.trim());
  return krstne ? `${krstne} ${priezvisko}` : (priezvisko ?? '');
};

/**
 * ELO zo zväzu. Rebríček appky meria usilovnosť — koľko dieťa chodí a hrá.
 * ELO meria silu. Rodič sa pýta na to druhé, preto tu je.
 */
function eloSekcia(s) {
  const historia = historiaRatingu(s.id);
  const posun = posunRatingu(s.id);

  const obsah = s.sszId
    ? el('div.card.stack', {},
      el('div.row.row--between', { style: { alignItems: 'baseline' } },
        el('div', {},
          el('div', { style: { fontSize: '26px', fontWeight: '700' }, text: s.rating ?? '—' }),
          el('div.small.muted', { text: s.rating ? 'ELO podľa zväzu' : 'zväz zatiaľ číslo neuvádza' }),
        ),
        posun && posun.posun !== 0
          ? el('div', { style: { textAlign: 'right' } },
            el('div.mono', {
              style: { fontSize: '18px', fontWeight: '700', color: posun.posun > 0 ? 'var(--green)' : 'var(--red)' },
              text: `${posun.posun > 0 ? '+' : ''}${posun.posun}`,
            }),
            el('div.item__sub', { text: 'za sezónu' }),
          )
          : null,
      ),
      historia.length > 1
        ? krivkaRatingu(historia)
        : el('p.tiny.faint', { style: { margin: 0 },
          text: 'Krivka sa objaví po druhom meraní — zväz aktualizuje ELO raz mesačne.' }),
      el('p.tiny.faint', { style: { margin: 0 },
        text: `Zväz: č. ${s.sszId}${s.fideId ? ` · FIDE ${s.fideId}` : ''}`
          + `${s.ratingAt ? ` · naposledy ${fmtDate(s.ratingAt)}` : ''}` }),
      el('div.row', { style: { gap: '8px' } },
        s.fideId
          ? el('a.btn.btn--ghost.btn--sm.grow', {
            href: `https://ratings.fide.com/profile/${s.fideId}`,
            target: '_blank', rel: 'noopener', style: { textDecoration: 'none' },
          }, 'FIDE profil ↗')
          : null,
        el('button.btn.btn--ghost.btn--sm', {
          text: 'Odpojiť',
          onclick: async () => {
            const ok = await confirmSheet('Odpojiť od zväzu?',
              'ELO sa prestane aktualizovať. História ostane.', { danger: true, okLabel: 'Odpojiť' });
            if (!ok) return;
            odpojitOdZvazu(s.id);
            toast('Odpojené');
            refresh();
          },
        }),
      ),
    )
    : el('div.card.stack', {},
      el('p.small.muted', { style: { margin: 0 },
        text: 'Keď žiaka prepojíte s matrikou zväzu, appka mu bude sama sťahovať ELO a ukáže, ako sa mení.' }),
      el('button.btn.btn--block', { text: '🔗 Prepojiť so zväzom', onclick: () => zvazSheet(s) }),
    );

  return el('div', {}, el('h2.section-title', { text: 'ELO' }), obsah);
}

/** Vyhľadanie v matrike zväzu. `hotovo` dostane vybraného hráča. */
function zvazVyberSheet(hotovo, predvolene = '') {
  sheet('Nájsť v matrike zväzu', (body, close) => {
    const vysledky = el('div.stack');
    const stav = el('p.small.muted', { style: { margin: 0 }, text: 'Zadajte priezvisko.' });
    let posledne = 0;

    const hladaj = textInput({ placeholder: 'Priezvisko…', value: predvolene, oninput: () => spusti() });

    const spusti = async () => {
      const q = hladaj.value.trim();
      const moje = ++posledne;
      if (q.length < 2) { mount(vysledky); stav.textContent = 'Zadajte aspoň dve písmená.'; return; }
      stav.textContent = 'Hľadám…';
      try {
        const najdene = await najdiVMatrike(q);
        if (moje !== posledne) return;
        stav.textContent = najdene.length ? `Nájdených ${najdene.length}` : 'Nikto taký v matrike nie je.';
        mount(vysledky, najdene.map((h) =>
          el('button.item', {
            onclick: () => { close(); hotovo(h); },
          },
            el('span.grow', {},
              el('div.item__title', { text: menoZMatriky(h.name) }),
              el('div.item__sub', { text: `${h.club || 'bez klubu'} · č. ${h.ssz_id}` }),
            ),
            el('span.mono', { style: { fontWeight: '700' }, text: String(h.rating ?? '—') }),
          ),
        ));
      } catch (e) {
        if (moje !== posledne) return;
        stav.textContent = `Nepodarilo sa: ${e.message}`;
      }
    };
    spusti();

    const stiahni = el('button.btn.btn--ghost.btn--block', {
      text: '↻ Stiahnuť maticu zo zväzu',
      onclick: async () => {
        stiahni.disabled = true;
        stav.textContent = 'Sťahujem maticu zväzu — chvíľu to trvá…';
        try {
          const v = await obnovitElo();
          stav.textContent = `Matica stiahnutá — ${v.hracov} hráčov.`;
          spusti();
        } catch (e) { stav.textContent = e.message; } finally { stiahni.disabled = false; }
      },
    });

    mount(body,
      el('p.small.muted', { style: { margin: 0 },
        text: 'Kto je registrovaný v zväze, toho netreba prepisovať ručne — meno, číslo aj ELO prídu odtiaľ. '
          + 'Neregistrovaného žiaka zapíšete normálne rukou.' }),
      hladaj, stav, vysledky, stiahni,
    );
  });
}

/** Prepojenie existujúceho žiaka. */
function zvazSheet(s) {
  zvazVyberSheet((h) => {
    prepojitSoZvazom(s.id, h);
    toast(`${s.name} prepojený · ELO ${h.rating ?? '—'}`);
    refresh();
  }, s.name.split(' ').at(-1) ?? '');
}

/* ---------------- detail žiaka ---------------- */
export function renderStudentDetail(root, studentId) {
  const s = studentById(studentId);
  if (!s) { mount(root, el('div.empty', { text: 'Žiak sa nenašiel.' })); return; }

  // História sa viaže na dochádzku, nie na aktuálnu skupinu — inak by žiakovi
  // po prechode medzi skupinami zmizli všetky staršie tréningy aj percento účasti.
  const attMap = new Map(db.attendance.filter((a) => a.studentId === s.id).map((a) => [a.sessionId, a]));
  const relevant = db.sessions
    .filter((x) => attMap.has(x.id))
    .sort((a, b) => b.date.localeCompare(a.date));
  const presentCount = relevant.filter((x) => attMap.get(x.id).present).length;
  const rate = relevant.length ? Math.round((presentCount / relevant.length) * 100) : 0;

  const payBox = el('div.stack');
  const paintPay = () => {
    const u = ucetZiaka(s.id);
    const zoznam = platbyZiaka(s.id).slice(0, 14);
    mount(payBox,
      el('div.stats', {},
        el('div.stat', {}, el('div.stat__num', { text: `${u.zaplatenych}/${u.treningov}` }),
          el('div.stat__lab', { text: 'zaplatených' })),
        el('div.stat', {}, el('div.stat__num', { text: `${u.vybrane} €` }), el('div.stat__lab', { text: 'zaplatil spolu' })),
        el('div.stat', {},
          el('div.stat__num', { style: { color: u.dlh ? 'var(--red)' : 'inherit' }, text: `${u.dlh} €` }),
          el('div.stat__lab', { text: 'dlhuje' })),
      ),
      zoznam.length === 0
        ? el('p.small.muted', { style: { margin: 0 }, text: 'Zatiaľ nebol na žiadnom tréningu.' })
        : el('div.card.card--flush.list', {}, zoznam.map(({ zaznam, trening }) =>
          el('button.item', {
            onclick: () => { toggleTrainingPaid(trening.id, s.id); paintPay(); },
          },
            el('span.grow', {},
              el('div.item__title', { text: `${fmtDayShort(trening.date)} · ${groupName(trening.groupId)}` }),
              trening.note ? el('div.item__sub', { text: trening.note }) : null,
            ),
            el('span', {
              class: `att__euro${zaznam.paid ? ' att__euro--paid' : ''}`,
              text: zaznam.paid ? `✓ ${zaznam.paidAmount ?? studentFee(s)} €` : `${studentFee(s)} €`,
            }),
          ),
        )),
    );
  };
  paintPay();

  mount(root, el('div.stack-lg', {},
    el('div.card.card--warm', {},
      el('div.row', {},
        el('span.avatar.avatar--ghost', { text: initials(s.name) }),
        el('span.grow', {},
          el('h2', { text: s.name, style: { fontSize: '20px' } }),
          el('div.small.muted', {
            text: trainsWithClub(s) ? studentGroupNames(s).join(' · ') : 'Hrá za klub · nechodí na tréningy',
          }),
        ),
      ),
      el('div.small.muted', { style: { marginTop: '12px' } },
        el('div', {}, `Kontakt: ${s.contactName || '—'}`,
          s.contactPhone
            ? el('a', { href: telHref(s.contactPhone), style: { marginLeft: '6px' } }, ` · ${s.contactPhone}`)
            : null),
        s.contactEmail ? el('div', {}, el('a', { href: `mailto:${s.contactEmail}` }, s.contactEmail)) : null,
        el('div', { text: `V klube od: ${fmtDate(s.startDate)}` }),
        trainsWithClub(s)
          ? el('div', {
            text: `Cena tréningu: ${studentFee(s)} €${hasOwnFee(s) ? ' (vlastná)' : ' (klubová)'}`,
          })
          : null,
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
      // rozpis podľa skupín — nech je vidieť, koľko toho odtrénoval online a koľko naživo
      studentGroupIds(s).length > 1
        ? el('div.card.card--flush.list', { style: { marginTop: '12px' } },
          studentGroupIds(s).map((gid) => {
            const vSkupine = relevant.filter((x) => x.groupId === gid);
            const bol = vSkupine.filter((x) => attMap.get(x.id).present);
            const minuty = bol.reduce((sum, x) => sum + durationMinutes(x), 0);
            return el('div.item', {},
              el('span.grow', {},
                el('div.item__title', { text: groupName(gid) }),
                el('div.item__sub', { text: `${bol.length} z ${vSkupine.length} tréningov` }),
              ),
              el('span.small.mono', { text: fmtHours(minuty) }),
            );
          }),
        )
        : null,
    ),

    eloSekcia(s),
    gamifikaciaSekcia(s),
    eventsSection(s),

    trainsWithClub(s) ? ospravedlneniaSekcia(s) : null,

    trainsWithClub(s)
      ? el('div', {},
        el('h2.section-title', { text: 'Platby za tréningy' }),
        el('div.card.stack', {},
          payBox,
          el('p.tiny.faint', { style: { marginBottom: 0 },
            text: 'Ťuknutím na tréning prepnete, či zaň zaplatil. Platí sa len za tréningy, na ktorých bol.' }),
        ),
      )
      : null,

    el('div', {},
      el('h2.section-title', { text: 'História tréningov' }),
      relevant.length === 0
        ? el('div.empty', { text: 'Zatiaľ žiadne záznamy.' })
        : el('div.card.card--flush.list', {},
          relevant.slice(0, 20).map((x) => {
            const present = attMap.get(x.id).present;
            return el('div.item', {},
              el('span.grow', {},
                el('div.item__title', {}, fmtDayShort(x.date),
                  el('span.faint', { style: { fontWeight: '400' }, text: ` · ${groupName(x.groupId)}` })),
                el('div.item__sub', {
                  text: `${x.startTime}–${x.endTime ?? '…'}${x.endTime ? ` · ${fmtHours(durationMinutes(x))}` : ''}`,
                }),
                x.note ? el('div.item__sub', { style: { color: 'var(--ink-soft)' }, text: `📘 ${x.note}` }) : null,
              ),
              el('span', { class: `tag tag--${present ? 'paid' : 'unpaid'}`, text: present ? 'bol' : 'chýbal' }),
            );
          }),
        ),
    ),

    // Anonymizácia je to, čo väčšinou naozaj chcete: osobné údaje preč,
    // ale odtrénované hodiny a vybraté peniaze ostanú vo vyúčtovaní klubu.
    s.anonymized ? null : el('button.btn.btn--ghost.btn--block', {
      text: '🕶 Zabudnúť osobné údaje',
      onclick: async () => {
        const ok = await confirmSheet('Zabudnúť osobné údaje?',
          `${s.name} príde o meno, kontakt aj poznámky a stane sa z neho anonymný záznam. `
          + 'Dochádzka a vybraté peniaze ostanú, aby vyúčtovanie klubu sedelo. Nedá sa to vrátiť.',
          { danger: true, okLabel: 'Zabudnúť' });
        if (!ok) return;
        anonymizovatZiaka(s.id);
        toast('Osobné údaje zabudnuté');
        go('/ziaci');
      },
    }),

    el('button.btn.btn--danger.btn--block', {
      text: 'Vymazať žiaka',
      onclick: async () => {
        const ok = await confirmSheet('Vymazať žiaka?',
          `${s.name} sa vymaže vrátane dochádzky a platieb. Ak chcete zachovať vyúčtovanie, `
          + 'použite radšej „Zabudnúť osobné údaje".',
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
/**
 * Formulár žiaka. `predvyplnene` slúži na návrat z hľadania v matrike —
 * hárky sa neukladajú na seba, takže formulár sa otvorí nanovo aj s tým,
 * čo už bolo napísané.
 */
export function studentSheet(student, defaultGroupId, predvyplnene = null) {
  const isNew = !student;
  // „netrenuju" je záložka zoznamu, nie skupina — nový človek pod ňou
  // je hráč, ktorý na tréningy nechodí. Predvolíme mu to a žiadnu skupinu.
  const zoZalozkyNetrenuju = defaultGroupId === 'netrenuju';
  const predvolenaSkupina = !zoZalozkyNetrenuju && sortedGroups().some((g) => g.id === defaultGroupId)
    ? defaultGroupId
    : sortedGroups()[0]?.id;

  sheet(isNew ? 'Nový žiak' : 'Upraviť žiaka', (body, close) => {
    const zoZvazu = { hrac: predvyplnene?.zvaz ?? null };
    const p0 = predvyplnene ?? {};
    const zvazRiadok = el('p.tiny', {
      style: {
        margin: '-4px 2px 0', color: 'var(--green)',
        display: predvyplnene?.zvaz ? '' : 'none',
      },
      text: predvyplnene?.zvaz
        ? `Zo zväzu: č. ${predvyplnene.zvaz.ssz_id}`
          + `${predvyplnene.zvaz.rating ? ` · ELO ${predvyplnene.zvaz.rating}` : ' · bez ELO'}`
        : '',
    });
    const pridanych = [];
    const pocitadlo = el('p.small', {
      style: { margin: '4px 2px 0', color: 'var(--green)', display: 'none' },
    });
    const name = textInput({ value: p0.name ?? student?.name ?? '', placeholder: 'Meno a priezvisko' });
    const trenuje = el('input', {
      type: 'checkbox',
      checked: student ? trainsWithClub(student) : !zoZalozkyNetrenuju,
      style: { width: '20px', height: '20px', accentColor: 'var(--terracotta)' },
      onchange: () => { skupinyBox.style.display = trenuje.checked ? '' : 'none'; },
    });

    // žiak môže chodiť do viacerých skupín (napr. Pokročilí + Pokročilí online)
    const zvolene = new Set(
      student ? studentGroupIds(student)
        : (zoZalozkyNetrenuju ? [] : [predvolenaSkupina].filter(Boolean)),
    );
    const groupBox = el('div.stack', { style: { gap: '6px' } },
      sortedGroups().map((g) =>
        el('label.row', {
          style: { gap: '10px', padding: '10px 12px', border: '1px solid var(--cream-line)', borderRadius: 'var(--r-md)', background: 'var(--white)', cursor: 'pointer' },
        },
          el('input', {
            type: 'checkbox',
            checked: zvolene.has(g.id),
            style: { width: '20px', height: '20px', accentColor: 'var(--terracotta)' },
            onchange: (e) => { e.target.checked ? zvolene.add(g.id) : zvolene.delete(g.id); },
          }),
          el('span.grow', { text: g.name }),
        ),
      ),
    );
    const contactName = textInput({ value: p0.contactName ?? student?.contactName ?? '', placeholder: 'Meno rodiča / žiaka' });
    const phone = el('input.input', { type: 'tel', value: p0.contactPhone ?? student?.contactPhone ?? '', placeholder: '0900 000 000' });
    const email = el('input.input', { type: 'email', value: p0.contactEmail ?? student?.contactEmail ?? '', placeholder: 'nepovinné' });
    const start = el('input.input', { type: 'date', value: student?.startDate ?? todayISO() });
    const fee = el('input.input', {
      type: 'number', step: '0.5', min: '0',
      value: student?.monthlyFee ?? '',
      placeholder: `klubová cena (${db.settings.fee} €)`,
    });
    const note = el('textarea.textarea', { placeholder: 'napr. hrá za mládežnícky tím' }, p0.note ?? student?.note ?? '');

    const skupinyBox = el('div', { style: { display: (student ? trainsWithClub(student) : !zoZalozkyNetrenuju) ? '' : 'none' } },
      field('Skupiny (môže byť vo viacerých)', groupBox));

    /** Uloží žiaka. Vráti ho, alebo nič, keď formulár nie je vyplnený. */
    const uloz = () => {
      if (!name.value.trim()) { toast('Zadajte meno žiaka'); return null; }
      if (trenuje.checked && !zvolene.size) { toast('Vyberte aspoň jednu skupinu'); return null; }
      const z = upsertStudent({
        id: student?.id,
        name: name.value.trim(),
        groupIds: trenuje.checked ? [...zvolene] : [],
        trains: trenuje.checked,
        contactName: contactName.value.trim(),
        contactPhone: phone.value.trim(),
        contactEmail: email.value.trim(),
        startDate: start.value || todayISO(),
        monthlyFee: fee.value === '' ? null : Number(fee.value),
        note: note.value.trim(),
        active: student?.active ?? true,
      });
      if (zoZvazu.hrac) prepojitSoZvazom(z.id, zoZvazu.hrac);
      return z;
    };

    /** Pripraví formulár na ďalšie dieťa. Skupina, dátum nástupu a cena
        ostávajú — tie sú pre celú skupinu rovnaké. Prepojenie na zväz sa
        musí zahodiť, inak by ďalšie dieťa dostalo cudzie ELO. */
    const vycisti = () => {
      name.value = '';
      contactName.value = '';
      phone.value = '';
      email.value = '';
      note.value = '';
      zoZvazu.hrac = null;
      zvazRiadok.style.display = 'none';
    };

    mount(body,
      // Kto je v matrike zväzu, toho netreba prepisovať ručne — meno, číslo
      // aj ELO prídu odtiaľ. Pre začiatočníkov, ktorí registrovaní nie sú,
      // ostáva všetko po starom.
      isNew ? el('button.btn.btn--soft.btn--block', {
        text: zoZvazu.hrac ? '🔗 Vybrať iného zo zväzu' : '🔗 Načítať zo zväzu',
        onclick: () => {
          const rozpisane = {
            name: name.value, contactName: contactName.value, contactPhone: phone.value,
            contactEmail: email.value, note: note.value,
          };
          close();
          zvazVyberSheet((h) => {
            studentSheet(null, defaultGroupId, {
              ...rozpisane, name: menoZMatriky(h.name), zvaz: h,
            });
          }, name.value.trim().split(' ').at(-1) ?? '');
        },
      }) : null,
      zvazRiadok,
      field('Meno *', name),
      el('label.row', {
        style: { gap: '10px', padding: '10px 12px', border: '1px solid var(--cream-line)', borderRadius: 'var(--r-md)', background: 'var(--white)', cursor: 'pointer' },
      },
        trenuje,
        el('span.grow', {},
          el('div', { text: 'Chodí na tréningy' }),
          el('div.tiny.faint', { text: 'Odškrtnite pri hráčovi, ktorý za klub len hrá — nebude v skupinách ani v platbách.' }),
        ),
      ),
      skupinyBox,
      field('Kontaktná osoba', contactName),
      el('div.grid2', {}, field('Telefón', phone), field('E-mail', email)),
      el('div.grid2', {}, field('Dátum nástupu', start), field('Cena tréningu (€)', fee)),
      el('p.tiny.faint', { style: { margin: '-4px 2px 0' },
        text: `Prázdne = platí klubovú cenu ${db.settings.fee} € za tréning. Vyplňte, len ak má tento žiak inú.` }),
      field('Poznámka', note),
      el('button.btn.btn--block', {
        text: isNew ? 'Pridať žiaka' : 'Uložiť zmeny',
        style: { marginTop: '8px' },
        onclick: () => {
          const novy = uloz();
          if (!novy) return;
          close();
          toast(isNew
            ? (zoZvazu.hrac ? `Žiak pridaný · ELO ${zoZvazu.hrac.rating ?? '—'}` : 'Žiak pridaný')
            : 'Uložené');
          refresh();
        },
      }),

      /* Na úvodnom otvorení klubu sa zapisuje dvadsať detí za sebou, keď
         okolo stoja rodičia. Formulár preto ostane otvorený a skupina
         predvolená — mení sa len meno. */
      isNew ? el('button.btn.btn--soft.btn--block', {
        text: 'Uložiť a pridať ďalšieho',
        onclick: () => {
          const novy = uloz();
          if (!novy) return;
          pridanych.push(novy.name);
          vycisti();
          pocitadlo.textContent = `✓ ${novy.name} pridaný · spolu ${pridanych.length}`;
          pocitadlo.style.display = '';
          name.focus();
        },
      }) : null,
      isNew ? pocitadlo : null,
    );
  });
}

const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

/** Ako sa hráčovi darilo na podujatí — stručne do riadku. */
function popisVysledku(r) {
  const partie = (r.wins || 0) + (r.draws || 0) + (r.losses || 0);
  const casti = [];
  if (r.placement) casti.push(`${r.placement}. miesto`);
  if (partie) casti.push(`${r.wins || 0}/${r.draws || 0}/${r.losses || 0} (V/R/P)`);
  if (!casti.length) casti.push('účasť');
  return casti.join(' · ');
}

/** Podujatia, ktorých sa hráč zúčastnil — počet, body a rozpis. */
function eventsSection(s) {
  const { from, to } = seasonRange();
  const suhrn = studentPointsSummary(s.id);
  const zoznam = studentEvents(s.id);
  const mimoSezony = studentEventsOutsideSeason(s.id);

  return el('div', {},
    el('div.row.row--between', { style: { alignItems: 'baseline' } },
      el('h2.section-title', { text: 'Podujatia' }),
      el('span.tiny.faint', { style: { marginTop: '14px' }, text: `sezóna ${fmtDate(from)} – ${fmtDate(to)}` }),
    ),

    el('div.stats', {},
      el('div.stat', {}, el('div.stat__num', { text: String(suhrn.events) }), el('div.stat__lab', { text: 'podujatí' })),
      el('div.stat', {}, el('div.stat__num', { text: String(suhrn.points) }), el('div.stat__lab', { text: 'XP z podujatí' })),
      el('div.stat', {},
        el('div.stat__num', { text: `${suhrn.wins}/${suhrn.draws}/${suhrn.losses}` }),
        el('div.stat__lab', { text: 'výhry/remízy/prehry' })),
    ),

    zoznam.length === 0
      ? el('div.empty', { style: { marginTop: '12px' } },
        'Zatiaľ nehral žiadne podujatie. Pridáte ho v Prehľady → Rebríček.')
      : el('div.card.card--flush.list', { style: { marginTop: '12px' } },
        zoznam.map(({ event, result }) =>
          el('button.item', { onclick: () => go(`/podujatie/${event.id}`) },
            el('span.grow', {},
              el('div.item__title', { text: event.name }),
              el('div.item__sub', {
                text: `${fmtDayShort(event.date)} · ${DRUHY_PODUJATI[event.kind] ?? event.kind}`
                  + (event.place ? ` · ${event.place}` : ''),
              }),
              el('div.item__sub', { style: { color: 'var(--ink-soft)' }, text: popisVysledku(result) }),
            ),
            el('span', { style: { textAlign: 'right' } },
              el('div.mono', { style: { fontWeight: '700' }, text: `${result.points} XP` }),
            ),
            el('span.chev', { text: '›' }),
          ),
        ),
      ),

    mimoSezony
      ? el('p.tiny.faint', { style: { margin: '8px 2px 0' },
        text: `Mimo tejto sezóny má ešte ${mimoSezony} ${mimoSezony < 5 ? 'podujatia' : 'podujatí'}. Obdobie zmeníte v Prehľady → Rebríček.` })
      : null,
  );
}
