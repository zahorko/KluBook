/* =========================================================
   Nastavenia — účet, synchronizácia, tréneri, klub, dáta
   ========================================================= */
import { el, mount, toast, sheet, confirmSheet, field, textInput, selectInput, downloadFile, skopirovat, fmtDate } from '../ui.js';
import {
  db, isCloud, saveNow, logout, initialsOf, uid, newSalt, hashPin, setDemoPin,
  exportJSON, importJSON, importJSONToCloud, resetAll, clearDemoData, todayISO,
  gamifikacia, updateGamifikacia, xpPreLevel, pridatTrenera,
  stavElo, obnovitElo, jeSpravca,
  updateSettings, updateTrainer, applyServerData, syncNow,
  setDevicePin, hasDevicePin, devicePinEmail, lockApp,
  studentById, groupName, trackingSince,
  sortedGroups, activeSchedule, upsertScheduleEntry, deleteScheduleEntry, DNI,
  scoringRules, updateScoring, recomputeAllPoints, DRUHY_PODUJATI,
} from '../store.js';
import { changePassword, session, lockHours, setLockHours, hasVault } from '../api.js';
import {
  state as syncState, onSyncChange, resetSyncState, retryFailed, clearFailed, clearSchemaWarning,
} from '../sync.js';
import { odznakEl, hodnost } from '../odznaky.js';
import { ikona } from '../ikony.js';
import { go, refresh } from '../router.js';
import { textPreRodicov } from '../contact.js';

export function renderSettings(root, trainer) {
  mount(root, el('div.stack-lg', {},
    accountCard(trainer),
    isCloud() ? syncCard() : null,
    trainersCard(),
    scheduleCard(),
    gamifikaciaCard(),
    scoringCard(),
    rodiciaCard(),
    eloCard(),
    clubCard(),
    dataCard(),
    versionLine(),
  ));
}

/**
 * Číslo verzie berieme z názvu offline cache, ktorý spravuje service worker —
 * je to jediné miesto, kde verzia žije, takže sa nemôže rozísť.
 * Keď ti tréner po telefóne prečíta číslo, hneď vieš, na čom beží.
 */
function versionLine() {
  const riadok = el('p.tiny.faint.center', {
    text: `KluBook · ${db.settings.clubName} · ${isCloud() ? 'pripojené k databáze' : 'demo režim'}`,
  });

  if ('caches' in window) {
    caches.keys().then((mena) => {
      const verzia = mena.find((m) => m.startsWith('klubook-'));
      if (!document.body.contains(riadok)) return;
      riadok.textContent = `KluBook ${verzia ? verzia.replace('klubook-', '') : '(vývojová)'}`
        + ` · ${db.settings.clubName} · ${isCloud() ? 'pripojené k databáze' : 'demo režim'}`;
    }).catch(() => {});
  }
  return riadok;
}

/* ---------------- účet ---------------- */
function accountCard(trainer) {
  const email = isCloud() ? (session()?.user?.email ?? devicePinEmail()) : null;

  return el('div', {},
    el('h2.section-title', { text: 'Môj účet' }),
    el('div.card.stack', {},
      el('div.row', {},
        el('span.avatar', { text: trainer.initials }),
        el('span.grow', {},
          el('div', { text: trainer.name, style: { fontWeight: '500' } }),
          el('div.tiny.faint', { text: email ?? 'Tréner · plný prístup ku všetkým skupinám' }),
        ),
      ),
      el('div.row.wrap', { style: { gap: '10px' } },
        isCloud()
          ? el('button.btn.btn--soft.btn--sm.grow', {
            text: hasDevicePin() ? 'Zmeniť PIN zariadenia' : 'Nastaviť PIN zariadenia',
            onclick: devicePinSheet,
          })
          : el('button.btn.btn--soft.btn--sm.grow', { text: 'Zmeniť PIN', onclick: () => demoPinSheet(trainer) }),
        isCloud()
          ? el('button.btn.btn--ghost.btn--sm', { text: 'Zmeniť heslo', onclick: passwordSheet })
          : null,
      ),
      isCloud() && hasDevicePin()
        // popis patrí pod tlačidlo, nie doň — v tlačidle sa lámal na dva riadky
        ? el('div', {},
          el('button.btn.btn--soft.btn--block', {
            onclick: () => {
              lockApp();
              toast('Zamknuté');
              go('/');
              refresh();
            },
          }, ikona('zamok', { velkost: 16 }), 'Zamknúť zariadenie'),
          el('p.hint', {
            text: 'Keď telefón alebo počítač preberá kolega. Appka sa zamkne a pri ďalšom otvorení si vypýta PIN.' }),
        )
        : null,
      isCloud() && hasVault() ? el('div', {},
        field('Pýtať PIN pri otvorení', selectInput([
          { value: '12', label: 'Po 12 hodinách (odporúčané)' },
          { value: '720', label: 'Raz za mesiac' },
          { value: '0', label: 'Nikdy — mám zamknuté zariadenie' },
        ], {
          value: String(lockHours()),
          onchange: (e) => {
            setLockHours(e.target.value);
            toast(Number(e.target.value) === 0
              ? 'PIN sa už pýtať nebude — appka sa otvorí rovno'
              : 'Uložené');
          },
        })),
        el('p.hint', {
          text: 'Platí len pre toto zariadenie. Pri „Nikdy" sa appka otvorí rovno — kto vezme odomknutý '
            + 'telefón do ruky, uvidí mená detí, kontakty aj platby. Na klubovom počítači to nechajte na 12 hodinách.' }),
      ) : null,

      el('button.btn.btn--ghost.btn--block', {
        text: 'Odhlásiť sa',
        onclick: async () => {
          const ok = await confirmSheet('Odhlásiť sa?',
            isCloud()
              ? 'Z tohto zariadenia sa vymaže vaše prihlásenie aj PIN — nabudúce budete potrebovať heslo. '
                + 'Ak chcete len prepnúť trénera, použite radšej „Zamknúť". Dáta ostávajú v databáze klubu.'
              : 'Vrátite sa na prihlasovaciu obrazovku.',
            { okLabel: 'Odhlásiť' });
          if (!ok) return;
          if (isCloud() && syncState.pending > 0) {
            const cont = await confirmSheet('Neodoslané zmeny',
              `V zariadení čaká ${syncState.pending} zmien, ktoré sa ešte nedostali na server. Ak sa odhlásite teraz, stratia sa. Skúsiť ich najprv odoslať?`,
              { danger: true, okLabel: 'Najprv odoslať' });
            if (cont) {
              try {
                await syncNow();
                toast('Odoslané');
              } catch {
                toast('Nepodarilo sa — skúste, keď budete online');
                return;
              }
            }
          }
          await logout();
          go('/');
          location.reload();
        },
      }),
    ),
  );
}

function devicePinSheet() {
  sheet('PIN pre toto zariadenie', (body, close) => {
    const p1 = el('input.input', { type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: '••••' });
    const p2 = el('input.input', { type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: '••••' });
    mount(body,
      el('p.small.muted', { style: { margin: 0 },
        text: 'PIN platí len pre toto zariadenie a odomyká ním uložené prihlásenie. Na inom telefóne si nastavíte vlastný.' }),
      field('Nový PIN (4 číslice)', p1),
      field('Zopakujte PIN', p2),
      el('button.btn.btn--block', {
        text: 'Uložiť PIN',
        style: { marginTop: '8px' },
        onclick: async () => {
          if (!/^\d{4}$/.test(p1.value)) { toast('PIN musí mať 4 číslice'); return; }
          if (p1.value !== p2.value) { toast('PIN-y sa nezhodujú'); return; }
          try {
            await setDevicePin(p1.value);
            close();
            toast('PIN uložený');
          } catch (e) {
            toast(e.message);
          }
        },
      }),
    );
  });
}

function passwordSheet() {
  sheet('Zmeniť heslo', (body, close) => {
    const p1 = el('input.input', { type: 'password', autocomplete: 'new-password', placeholder: 'aspoň 8 znakov' });
    const p2 = el('input.input', { type: 'password', autocomplete: 'new-password' });
    mount(body,
      field('Nové heslo', p1),
      field('Zopakujte heslo', p2),
      el('button.btn.btn--block', {
        text: 'Zmeniť heslo',
        style: { marginTop: '8px' },
        onclick: async () => {
          if (p1.value.length < 8) { toast('Heslo musí mať aspoň 8 znakov'); return; }
          if (p1.value !== p2.value) { toast('Heslá sa nezhodujú'); return; }
          try {
            await changePassword(p1.value);
            close();
            toast('Heslo zmenené');
          } catch (e) {
            toast(e.message);
          }
        },
      }),
    );
  });
}

function demoPinSheet(trainer) {
  sheet('Zmeniť PIN', (body, close) => {
    const p1 = el('input.input', { type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: '••••' });
    const p2 = el('input.input', { type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: '••••' });
    mount(body,
      field('Nový PIN (4 číslice)', p1),
      field('Zopakujte PIN', p2),
      el('button.btn.btn--block', {
        text: 'Uložiť PIN',
        style: { marginTop: '8px' },
        onclick: async () => {
          if (!/^\d{4}$/.test(p1.value)) { toast('PIN musí mať 4 číslice'); return; }
          if (p1.value !== p2.value) { toast('PIN-y sa nezhodujú'); return; }
          await setDemoPin(trainer.id, p1.value);
          close();
          toast('PIN zmenený');
        },
      }),
    );
  });
}

/* ---------------- synchronizácia ---------------- */
function syncCard() {
  const line = el('div.small.muted');
  const paint = () => {
    const { status, pending, lastSync, lastError } = syncState;
    const when = lastSync
      ? new Date(lastSync).toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'zatiaľ nikdy';
    const label = {
      idle: pending ? `Čaká ${pending} zmien na odoslanie` : 'Všetko zosynchronizované',
      syncing: 'Synchronizujem…',
      offline: `Bez pripojenia · čaká ${pending} zmien`,
      error: `Chyba: ${lastError ?? 'neznáma'}`,
    }[status] ?? status;
    line.textContent = `${label} · naposledy ${when}`;
  };
  paint();
  const off = onSyncChange(() => {
    if (!document.body.contains(line)) { off(); return; }
    paint();
  });

  const varovanie = syncState.schemaWarning
    ? el('div.card', { style: { background: 'var(--red-l)', borderColor: 'transparent' } },
      el('div.row', { style: { gap: '6px', fontWeight: '600', marginBottom: '4px' } },
        ikona('pozor', { velkost: 15 }), 'Databáza nie je aktuálna'),
      el('p.small', { style: { margin: '0 0 10px' }, text: syncState.schemaWarning.message }),
      el('button.btn.btn--ghost.btn--sm', {
        text: 'Už som to spustil',
        onclick: () => { clearSchemaWarning(); toast('Skryté'); refresh(); },
      }),
    )
    : null;

  return el('div', {},
    el('h2.section-title', { text: 'Synchronizácia' }),
    varovanie,
    el('div.card.stack', { style: varovanie ? { marginTop: '12px' } : {} },
      line,
      el('button.btn.btn--soft.btn--block', {
        text: 'Synchronizovať teraz',
        onclick: async () => {
          try {
            const data = await syncNow();
            if (data) applyServerData(data);
            toast('Hotovo');
            refresh();
          } catch (e) {
            toast(`Nepodarilo sa: ${e.message}`);
          }
        },
      }),
      syncState.failed.length
        ? el('div', {},
          el('p.small', { style: { color: 'var(--red)', marginBottom: '8px' },
            text: `${syncState.failed.length} ${sklonujZmeny(syncState.failed.length)} sa v minulosti nepodarilo odoslať. `
              + 'Zelená fajka hore znamená, že práve teraz je všetko odoslané — toto je staršia nedoručená zmena.' }),
          el('div.row.wrap', { style: { gap: '8px' } },
            el('button.btn.btn--soft.btn--sm', { text: 'Zobraziť podrobnosti', onclick: failedSheet }),
            el('button.btn.btn--ghost.btn--sm', {
              text: 'Skúsiť znova',
              onclick: async () => {
                toast('Skúšam odoslať…');
                await retryFailed();
                if (syncState.failed.length) toast('Časť sa stále nepodarila — pozrite podrobnosti');
                else toast('Odoslané');
                refresh();
              },
            }),
            el('button.btn.btn--danger.btn--sm', {
              text: 'Zabudnúť',
              onclick: async () => {
                const ok = await confirmSheet('Zabudnúť zmeny?',
                  'Zoznam sa vymaže. Ak tie zmeny na serveri chýbajú, zadajte ich znova ručne.',
                  { danger: true, okLabel: 'Zabudnúť' });
                if (!ok) return;
                clearFailed();
                toast('Zoznam vyčistený');
                refresh();
              },
            }),
          ),
        )
        : null,
    ),
  );
}

const sklonujZmeny = (n) => (n === 1 ? 'zmenu' : n < 5 ? 'zmeny' : 'zmien');

/** Databázové hlášky preložené do reči, s ktorou sa dá niečo spraviť. */
function vysvetliChybu(text = '') {
  const t = String(text);
  if (/null value in column "id"/i.test(t)) {
    return 'Záznam nemá identifikátor — vznikol chybou staršej verzie appky. Zadajte ho znova a tento zoznam vyčistite.';
  }
  if (/null value in column "(student_id|session_id)"/i.test(t)) {
    return 'Záznam odkazuje na žiaka alebo tréning bez identifikátora — tiež následok tej istej chyby. Zadajte ho znova a zoznam vyčistite.';
  }
  if (/violates foreign key/i.test(t)) {
    return 'Súvisiaci záznam v databáze chýba — žiak alebo tréning bol medzitým zmazaný.';
  }
  if (/row-level security/i.test(t)) {
    return 'Databáza zápis odmietla. Skontrolujte, či je váš účet v tabuľke trainers a má active = true.';
  }
  if (/duplicate key/i.test(t)) return 'Taký záznam už v databáze existuje.';
  if (/Could not find the '(\w+)' column/i.test(t)) {
    return 'V databáze chýba stĺpec — spustite najnovší SQL súbor z priečinka sql/.';
  }
  return t;
}

/** Ľudský popis toho, čoho sa neodoslaná zmena týkala. */
function popisZmeny(f) {
  const r = f.row ?? {};
  const zmazanie = f.op === 'delete' ? 'Zmazanie — ' : '';
  const meno = (id) => studentById(id)?.name ?? id ?? '—';
  switch (f.table) {
    case 'students': return `${zmazanie}Žiak: ${r.name ?? meno(r.id)}`;
    case 'sessions': return `${zmazanie}Tréning ${r.date ?? ''} · ${groupName(r.group_id)}`;
    case 'attendance': return `${zmazanie}Dochádzka: ${meno(r.student_id)}`;
    case 'payments': return `${zmazanie}Platba: ${meno(r.student_id)} · ${r.period ?? ''}`;
    case 'trainers': return `${zmazanie}Tréner: ${r.name ?? r.id}`;
    case 'club_settings': return 'Nastavenia klubu';
    default: return `${zmazanie}${f.table}`;
  }
}

function failedSheet() {
  sheet('Neodoslané zmeny', (body) => {
    mount(body,
      el('p.small.muted', { style: { margin: 0 },
        text: 'Tieto zmeny sa nepodarilo dostať na server. Sú uložené v tomto zariadení — '
          + 'skúste ich odoslať znova, alebo ich zadajte ručne a zoznam vyčistite.' }),
      el('div.card.card--flush.list', {},
        syncState.failed.map((f) =>
          el('div.item', {},
            el('span.grow', {},
              el('div.item__title', { text: popisZmeny(f) }),
              el('div.item__sub', { style: { color: 'var(--red)' }, text: vysvetliChybu(f.error) }),
              el('div.tiny.faint', {
                text: f.at ? new Date(f.at).toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
              }),
            ),
          ),
        ),
      ),
    );
  });
}

/* ---------------- tréneri ---------------- */
function trainersCard() {
  if (isCloud()) {
    return el('div', {},
      el('h2.section-title', { text: 'Tréneri' }),
      el('div.card.card--flush.list', {},
        db.trainers.map((t) =>
          el('button.item', { onclick: () => cloudTrainerSheet(t) },
            el('span.avatar.avatar--ghost', { text: t.initials }),
            el('span.grow', {},
              el('div.item__title', {}, t.name,
                t.isAdmin ? el('span.tag', { text: 'správca', style: { marginLeft: '8px' } }) : null),
              el('div.item__sub', { text: t.active ? 'aktívny' : 'neaktívny' }),
            ),
            el('span.chev', { text: '›' }),
          ),
        ),
      ),
      jeSpravca()
        ? el('button.btn.btn--block', {
          text: '＋ Pridať trénera',
          style: { marginTop: '12px' },
          onclick: () => novyTrenerSheet(),
        })
        : null,
      el('p.hint', {
        text: jeSpravca()
          ? 'Účet vznikne rovno tu. Heslo odovzdajte trénerovi osobne — pri prvom prihlásení si ho môže zmeniť.'
          : 'Nových trénerov zakladá správca klubu.' }),
    );
  }

  return el('div', {},
    el('h2.section-title', { text: 'Tréneri' }),
    el('div.card.card--flush.list', {},
      db.trainers.map((t) =>
        el('button.item', { onclick: () => demoTrainerSheet(t) },
          el('span.avatar.avatar--ghost', { text: t.initials }),
          el('span.grow', {},
            el('div.item__title', { text: t.name }),
            el('div.item__sub', { text: t.active ? 'aktívny' : 'neaktívny' }),
          ),
          el('span.chev', { text: '›' }),
        ),
      ),
    ),
    el('button.btn.btn--ghost.btn--block', {
      style: { marginTop: '12px' },
      text: '＋ Pridať trénera',
      onclick: () => demoTrainerSheet(null),
    }),
  );
}

function cloudTrainerSheet(trainer) {
  sheet('Upraviť trénera', (body, close) => {
    const name = textInput({ value: trainer.name });
    mount(body,
      field('Meno', name),
      el('p.tiny.faint', { text: 'Prihlasovací e-mail a heslo sa menia v Supabase, nie tu.' }),
      el('button.btn.btn--block', {
        text: 'Uložiť',
        onclick: () => {
          if (!name.value.trim()) { toast('Zadajte meno'); return; }
          trainer.name = name.value.trim();
          trainer.initials = initialsOf(trainer.name);
          updateTrainer(trainer);
          close();
          toast('Uložené');
          refresh();
        },
      }),
      el('button.btn.btn--ghost.btn--block', {
        text: trainer.active ? 'Deaktivovať (stratí prístup)' : 'Aktivovať',
        onclick: () => {
          trainer.active = !trainer.active;
          updateTrainer(trainer);
          close();
          refresh();
        },
      }),
    );
  });
}

function demoTrainerSheet(trainer) {
  const isNew = !trainer;
  sheet(isNew ? 'Nový tréner' : 'Upraviť trénera', (body, close) => {
    const name = textInput({ value: trainer?.name ?? '', placeholder: 'Meno a priezvisko' });
    const pin = el('input.input', {
      type: 'text', inputmode: 'numeric', maxlength: '4',
      placeholder: isNew ? '4-miestny PIN' : 'ponechať bez zmeny',
    });

    mount(body,
      field('Meno *', name),
      field(isNew ? 'PIN *' : 'Nový PIN (nepovinné)', pin),
      el('button.btn.btn--block', {
        text: isNew ? 'Vytvoriť účet' : 'Uložiť',
        style: { marginTop: '8px' },
        onclick: async () => {
          if (!name.value.trim()) { toast('Zadajte meno'); return; }
          if (isNew) {
            if (!/^\d{4}$/.test(pin.value)) { toast('PIN musí mať 4 číslice'); return; }
            const salt = newSalt();
            db.trainers.push({
              id: uid('trn'), name: name.value.trim(), initials: initialsOf(name.value),
              salt, pinHash: await hashPin(pin.value, salt),
              groupIds: [], active: true, createdAt: new Date().toISOString(),
            });
            saveNow();
          } else {
            trainer.name = name.value.trim();
            trainer.initials = initialsOf(trainer.name);
            saveNow();
            if (/^\d{4}$/.test(pin.value)) await setDemoPin(trainer.id, pin.value);
          }
          close();
          toast(isNew ? 'Účet vytvorený' : 'Uložené');
          refresh();
        },
      }),
      isNew ? null : el('button.btn.btn--ghost.btn--block', {
        text: trainer.active ? 'Deaktivovať účet' : 'Aktivovať účet',
        onclick: () => { trainer.active = !trainer.active; saveNow(); close(); refresh(); },
      }),
    );
  });
}

/* ---------------- rozvrh ---------------- */
function scheduleCard() {
  const rozvrh = activeSchedule();
  return el('div', {},
    el('h2.section-title', { text: 'Rozvrh tréningov' }),
    rozvrh.length === 0
      ? el('div.empty', { style: { marginBottom: '12px' } },
        'Zatiaľ bez rozvrhu. Keď ho vyplníte, appka vám dnešný tréning ponúkne jedným ťuknutím '
        + 'a upozorní, keď ho zabudnete zapísať.')
      : el('div.card.card--flush.list', {},
        rozvrh.map((r) =>
          el('button.item', { onclick: () => scheduleSheet(r) },
            el('span.grow', {},
              el('div.item__title', { text: `${DNI[r.weekday]} · ${r.startTime}–${r.endTime}` }),
              el('div.item__sub', { text: groupName(r.groupId) }),
            ),
            el('span.chev', { text: '›' }),
          ),
        ),
      ),
    el('button.btn.btn--ghost.btn--block', {
      style: { marginTop: '12px' },
      text: '＋ Pridať do rozvrhu',
      onclick: () => scheduleSheet(null),
    }),
  );
}

function scheduleSheet(zaznam) {
  const novy = !zaznam;
  sheet(novy ? 'Nový tréning v rozvrhu' : 'Upraviť rozvrh', (body, close) => {
    const den = selectInput(
      [1, 2, 3, 4, 5, 6, 0].map((i) => ({ value: String(i), label: DNI[i] })),
      { value: String(zaznam?.weekday ?? 2) },
    );
    const skupina = selectInput(sortedGroups().map((g) => ({ value: g.id, label: g.name })),
      { value: zaznam?.groupId ?? sortedGroups()[0].id });
    const od = el('input.input', { type: 'time', value: zaznam?.startTime ?? '16:00' });
    const doo = el('input.input', { type: 'time', value: zaznam?.endTime ?? '17:30' });
    const trener = selectInput(
      [{ value: '', label: '— ktokoľvek —' }, ...db.trainers.map((t) => ({ value: t.id, label: t.name }))],
      { value: zaznam?.trainerId ?? '' },
    );

    mount(body,
      field('Deň', den),
      field('Skupina', skupina),
      el('div.grid2', {}, field('Od', od), field('Do', doo)),
      field('Zvyčajne vedie', trener),
      el('p.hint', {
        text: 'Rozvrh tréningy sám nevytvára — len ich ponúka a upozorní, keď niektorý chýba.' }),
      el('button.btn.btn--block', {
        text: novy ? 'Pridať' : 'Uložiť',
        style: { marginTop: '8px' },
        onclick: () => {
          if (doo.value <= od.value) { toast('Koniec musí byť po začiatku'); return; }
          upsertScheduleEntry({
            id: zaznam?.id,
            weekday: Number(den.value),
            groupId: skupina.value,
            startTime: od.value,
            endTime: doo.value,
            trainerId: trener.value || null,
          });
          close();
          toast('Uložené');
          refresh();
        },
      }),
      novy ? null : el('button.btn.btn--danger.btn--block', {
        text: 'Odobrať z rozvrhu',
        onclick: async () => {
          const ok = await confirmSheet('Odobrať z rozvrhu?',
            'Už zapísané tréningy ostanú, zmizne len toto pravidelné okno.',
            { danger: true, okLabel: 'Odobrať' });
          if (!ok) return;
          deleteScheduleEntry(zaznam.id);
          close();
          toast('Odobraté');
          refresh();
        },
      }),
    );
  });
}

/* ---------------- bodovanie ---------------- */

/** Nastavenie levelov a goldov. Čísla sú tu naschvál otvorené —
    po prvej sezóne uvidíte, či deti postupujú príliš rýchlo alebo pomaly. */
function gamifikaciaCard() {
  const g = gamifikacia();

  const cislo = (kluc, popis, krok = '1') => field(popis, el('input.input', {
    type: 'number', step: krok, min: '0', value: g[kluc],
    onchange: (e) => {
      updateGamifikacia({ [kluc]: Math.max(0, Number(e.target.value) || 0) });
      toast('Uložené');
      refresh();
    },
  }));

  // ukážka, čo tie čísla znamenajú — inak sú to len čísla.
  // Hodnosť je pri ladení dôležitejšia než level: to je to, čo deti vidia.
  const ukazka = [2, 5, 10, 20].map((lvl) =>
    el('div.row', { style: { gap: '10px', alignItems: 'center' } },
      odznakEl(lvl, { velkost: 26 }),
      el('span.small.grow', { text: `Level ${lvl} · ${hodnost(lvl).nazov}` }),
      el('span.mono.small', { text: `${xpPreLevel(lvl)} XP` }),
    ));

  const tyzdnovXP = g.xpZaTrening * 2;

  return el('div', {},
    el('h2.section-title', { text: 'Levely a goldy' }),
    el('div.card.stack', {},
      el('p.small.muted', { style: { margin: 0 },
        text: 'XP sa počíta z dochádzky a podujatí, nikde sa neukladá — po zmene týchto čísel sa všetko prepočíta samo. '
          + 'Pozor pri znižovaní: komu tým ubudnú goldy, môže mať zostatok v mínuse, kým si to nedobehne. Nákupy sa nemažú.' }),
      el('div.grid2', {}, cislo('xpZaTrening', 'XP za tréning'), cislo('goldZaLevel', 'Goldov za level up')),
      el('div.grid2', {}, cislo('seriaDlzka', 'Séria: koľko po sebe'), cislo('seriaBonus', 'Bonus XP za sériu')),
      el('div.grid2', {}, cislo('levelZaklad', 'XP na prvý level'), cislo('levelKrok', 'O koľko drahší každý ďalší')),
      cislo('maxLevel', 'Najvyšší level'),
      el('div', {},
        el('div.field__label', { text: 'Ako to vyjde' }),
        el('div.card.stack', { style: { background: 'var(--cream-deep)', borderColor: 'transparent', gap: '4px' } },
          ...ukazka,
          el('p.hint', {
            text: `Kto chodí dvakrát do týždňa a nikam nejde hrať, nazbiera ${tyzdnovXP} XP týždenne`
              + `${g.seriaDlzka ? ` a každých ${g.seriaDlzka} tréningov po sebe mu pridá ${g.seriaBonus} XP navyše` : ''}.` }),
        ),
      ),
    ),
  );
}

function scoringCard() {
  const pravidla = scoringRules();

  const cislo = (kind, kluc, popis) => field(popis, el('input.input', {
    type: 'number', step: '0.5', value: pravidla[kind][kluc],
    onchange: (e) => {
      updateScoring(kind, { [kluc]: Number(e.target.value) || 0 });
      const zmenene = recomputeAllPoints();
      toast(zmenene ? `Uložené · prepočítaných ${zmenene} výsledkov` : 'Uložené');
    },
  }));

  const umiestnenie = (miesto) => field(`${miesto}. miesto`, el('input.input', {
    type: 'number', step: '1', value: pravidla.turnaj.umiestnenie?.[miesto] ?? 0,
    onchange: (e) => {
      const tab = { ...(scoringRules().turnaj.umiestnenie ?? {}), [miesto]: Number(e.target.value) || 0 };
      updateScoring('turnaj', { umiestnenie: tab });
      const zmenene = recomputeAllPoints();
      toast(zmenene ? `Uložené · prepočítaných ${zmenene} výsledkov` : 'Uložené');
    },
  }));

  return el('div', {},
    el('h2.section-title', { text: 'XP za hranie' }),
    el('div.card.stack', {},
      el('p.small.muted', { style: { margin: 0 },
        text: 'Koľko XP dostane hráč za podujatie. Po zmene sa všetky doterajšie výsledky prepočítajú.' }),

      el('div', {},
        el('div.field__label', { text: `${DRUHY_PODUJATI.liga} — jedna partia` }),
        el('div.grid2', {}, cislo('liga', 'ucast', 'Za účasť'), cislo('liga', 'vyhra', 'Výhra')),
        el('div.grid2', {}, cislo('liga', 'remiza', 'Remíza'), cislo('liga', 'prehra', 'Prehra')),
      ),

      el('div', {},
        el('div.field__label', { text: `${DRUHY_PODUJATI.turnaj} — viac partií za deň` }),
        el('div.grid2', {}, cislo('turnaj', 'ucast', 'Za účasť'), cislo('turnaj', 'vyhra', 'Za výhru')),
        el('div.grid2', {}, cislo('turnaj', 'remiza', 'Za remízu'), cislo('turnaj', 'prehra', 'Za prehru')),
        el('div.field__label', { text: 'Bonus XP za umiestnenie', style: { marginTop: '10px' } }),
        el('div.grid2', {}, umiestnenie(1), umiestnenie(2)),
        el('div.grid2', {}, umiestnenie(3), umiestnenie(4)),
      ),
    ),
  );
}

/* ---------------- klub ---------------- */
function clubCard() {
  return el('div', {},
    el('h2.section-title', { text: 'Klub' }),
    el('div.card.stack', {},
      field('Názov klubu', textInput({
        value: db.settings.clubName,
        onchange: (e) => { updateSettings({ clubName: e.target.value }); toast('Uložené'); },
      })),
      field('Krátky názov (hlavička)', textInput({
        value: db.settings.shortName ?? db.settings.clubName,
        onchange: (e) => { updateSettings({ shortName: e.target.value }); toast('Uložené'); refresh(); },
      })),
      field('Cena jedného tréningu (€)', el('input.input', {
        type: 'number', step: '0.5', value: db.settings.fee,
        onchange: (e) => { updateSettings({ fee: Number(e.target.value) || 0 }); toast('Uložené'); },
      })),
      el('p.hint', {
        text: 'Platí sa za odtrénovanú hodinu. Konkrétnemu žiakovi sa dá nastaviť iná cena v jeho karte.' }),
      field('Evidencia platieb od', el('input.input', {
        type: 'month',
        value: db.settings.trackingSince ?? trackingSince(),
        onchange: (e) => {
          updateSettings({ trackingSince: e.target.value || null });
          toast('Uložené');
          refresh();
        },
      })),
      el('p.hint', {
        text: 'Prehľady nezobrazujú mesiace spred tohto dátumu. Nastavte napríklad začiatok sezóny.' }),
    ),
  );
}


/** Náhodné heslo, ktoré sa dá prečítať do telefónu bez chýb. */
function navrhnutHeslo() {
  const slova = ['veza', 'strelec', 'jazdec', 'pesiak', 'kral', 'dama', 'rosada', 'matt'];
  const s = slova[Math.floor(Math.random() * slova.length)];
  const cislo = 100 + Math.floor(Math.random() * 900);
  return `${s}-${cislo}-sach`;
}

/** Založenie účtu ďalšiemu trénerovi. */
function novyTrenerSheet() {
  sheet('Nový tréner', (body, close) => {
    const meno = textInput({ placeholder: 'Meno a priezvisko' });
    const email = el('input.input', { type: 'email', placeholder: 'email@priklad.sk', autocapitalize: 'off', spellcheck: 'false' });
    const heslo = textInput({ value: navrhnutHeslo() });
    const stav = el('p.small', { style: { margin: 0, minHeight: '18px' } });

    const uloz = el('button.btn.btn--block', {
      text: 'Založiť účet',
      style: { marginTop: '8px' },
      onclick: async () => {
        if (!meno.value.trim()) { toast('Zadajte meno'); return; }
        uloz.disabled = true;
        stav.textContent = 'Zakladám účet…';
        stav.style.color = 'var(--ink-soft)';
        try {
          await pridatTrenera({ name: meno.value.trim(), email: email.value.trim(), password: heslo.value });
          close();
          toast(`${meno.value.trim()} má účet`);
          // heslo ukážeme ešte raz, nech ho má tréner z čoho prečítať
          sheet('Účet je hotový', (b2) => {
            mount(b2,
              el('p.small.muted', { style: { margin: 0 }, text: 'Odovzdajte tieto údaje trénerovi. Heslo sa už nebude dať zobraziť.' }),
              el('div.card.stack', { style: { background: 'var(--cream-deep)', borderColor: 'transparent' } },
                el('div', {}, el('div.tiny.faint', { text: 'E-mail' }), el('div.mono', { text: email.value.trim() })),
                el('div', {}, el('div.tiny.faint', { text: 'Heslo' }),
                  el('div.mono', { style: { fontSize: '18px', fontWeight: '700' }, text: heslo.value })),
              ),
              el('p.tiny.faint', { style: { margin: 0 },
                text: 'Nech si appku otvorí na 1skke.zahorcek.com, prihlási sa a nastaví si PIN.' }),
            );
          });
          refresh();
        } catch (e) {
          stav.textContent = e.message;
          stav.style.color = 'var(--red)';
          uloz.disabled = false;
        }
      },
    });

    mount(body,
      el('p.small.muted', { style: { margin: 0 },
        text: 'Tréner sa bude prihlasovať e-mailom a heslom. Účet vznikne hneď a uvidí všetky dáta klubu.' }),
      field('Meno *', meno),
      field('E-mail *', email),
      field('Heslo', heslo),
      el('p.hint', { text: 'Aspoň 8 znakov. Pokojne nechajte navrhnuté.' }),
      stav,
      uloz,
    );
  });
}


/**
 * Informácia pre rodičov. Súhlas na bežnú klubovú evidenciu netreba —
 * ale informovať rodičov áno, a to sa robí raz pri prihláške.
 */
function rodiciaCard() {
  const text = () => textPreRodicov({
    klub: db.settings.clubName,
    kontakt: session()?.user?.email ?? '',
  });

  return el('div', {},
    el('h2.section-title', { text: 'Informácia pre rodičov' }),
    el('div.card.stack', {},
      el('p.small.muted', { style: { margin: 0 },
        text: 'Čo klub o dieťati eviduje a prečo. Dajte to rodičom pri prihláške — '
          + 'informovať ich musíte aj vtedy, keď súhlas nepotrebujete.' }),
      el('button.btn.btn--block', { onclick: () => rodiciaSheet(text()) },
        ikona('dokument', { velkost: 16 }), 'Zobraziť text'),
      el('p.tiny.faint', { style: { margin: 0 },
        text: 'Text je pripravený na bežný šachový krúžok. Pred prvým použitím si ho prejdite '
          + 'a doplňte, čo máte inak. Nie je to právne poradenstvo.' }),
    ),
  );
}

function rodiciaSheet(text) {
  sheet('Informácia pre rodičov', (body, close) => {
    const pole = el('textarea.textarea', { style: { minHeight: '260px', fontSize: '13px' } }, text);
    mount(body,
      el('p.small.muted', { style: { margin: 0 }, text: 'Môžete si ho tu upraviť a potom skopírovať alebo poslať.' }),
      pole,
      el('button.btn.btn--block', {
        onclick: () => skopirovat(pole.value, 'Skopírované — vložte do e-mailu alebo dokumentu'),
      }, ikona('dokument', { velkost: 16 }), 'Skopírovať'),
      el('button.btn.btn--ghost.btn--block', {
        text: '⤓ Uložiť ako súbor',
        onclick: () => {
          downloadFile(`informacia-pre-rodicov-${todayISO()}.txt`, pole.value, 'text/plain');
          toast('Stiahnuté');
        },
      }),
      el('button.btn.btn--ghost.btn--block', { text: 'Zavrieť', onclick: close }),
    );
  });
}


/**
 * ELO zo zväzu. Sťahuje ho server raz za čas — chess.sk appku v telefóne
 * priamo k sebe nepustí. Tu je vidieť, ako to stojí, a dá sa to vyvolať ručne.
 */
function eloCard() {
  const st = stavElo();
  const stav = el('p.small', { style: { margin: 0 } });

  const obnov = el('button.btn.btn--block', {
    text: '↻ Stiahnuť aktuálne ELO',
    onclick: async () => {
      obnov.disabled = true;
      stav.style.color = 'var(--ink-soft)';
      stav.textContent = 'Sťahujem maticu zväzu — chvíľu to trvá…';
      try {
        const v = await obnovitElo();
        stav.style.color = 'var(--green)';
        stav.textContent = `Hotovo — matica má ${v.hracov} hráčov, `
          + `zmenené ELO u ${v.zmenenych} z ${v.ziakov} prepojených.`;
        setTimeout(refresh, 1500);
      } catch (e) {
        stav.style.color = 'var(--red)';
        stav.textContent = e.message;
      } finally {
        obnov.disabled = false;
      }
    },
  });

  return el('div', {},
    el('h2.section-title', { text: 'ELO zo zväzu' }),
    el('div.card.stack', {},
      el('p.small.muted', { style: { margin: 0 },
        text: 'Appka si sama sťahuje ELO zo Slovenského šachového zväzu. '
          + 'Prepojenie žiaka s matrikou nastavíte na jeho karte.' }),
      el('div.stats', {},
        el('div.stat', {}, el('div.stat__num', { text: `${st.prepojenych}/${st.celkom}` }),
          el('div.stat__lab', { text: 'prepojených žiakov' })),
        el('div.stat', {}, el('div.stat__num', { text: st.najnovsie ? fmtDate(st.najnovsie) : '—' }),
          el('div.stat__lab', { text: 'naposledy' })),
      ),
      obnov,
      stav,
      el('p.tiny.faint', { style: { margin: 0 },
        text: 'Zväz zverejňuje jedno číslo: kým hráč nemá FIDE, je to národné ELO, od 1400 vyššie priamo FIDE. '
          + 'Keby zväz zmenil formát, appka nič neprepíše a ostane pri poslednom známom čísle.' }),
    ),
  );
}

/* ---------------- dáta ---------------- */
function dataCard() {
  return el('div', {},
    el('h2.section-title', { text: 'Dáta' }),
    el('div.card.stack', {},
      el('p.small.muted', { style: { margin: 0 },
        text: isCloud()
          ? 'Dáta sú v spoločnej databáze klubu a synchronizujú sa medzi trénermi. Zálohu si môžete stiahnuť ako súbor a v prípade potreby ju z neho obnoviť.'
          : 'Demo režim: dáta sú len v tomto zariadení. Zálohu si stiahnite ako súbor.' }),
      el('button.btn.btn--ghost.btn--block', {
        text: '⤓ Stiahnuť zálohu (JSON)',
        onclick: () => { downloadFile(`klubook-zaloha-${todayISO()}.json`, exportJSON()); toast('Záloha stiahnutá'); },
      }),
      el('button.btn.btn--ghost.btn--block', { text: '⤒ Obnoviť zo zálohy', onclick: importFlow }),
      db.demo
        ? el('button.btn.btn--danger.btn--block', {
          text: 'Vymazať demo dáta a začať načisto',
          onclick: async () => {
            const ok = await confirmSheet('Vymazať demo dáta?',
              'Zmažú sa ukážkoví žiaci, tréningy a platby. Účty trénerov ostanú.',
              { danger: true, okLabel: 'Vymazať' });
            if (!ok) return;
            clearDemoData();
            toast('Hotovo — appka je prázdna');
            go('/ziaci');
          },
        })
        : null,
      el('button.btn.btn--danger.btn--block', {
        text: isCloud() ? 'Vymazať dáta z tohto zariadenia' : 'Úplný reset appky',
        onclick: async () => {
          const ok = await confirmSheet(
            isCloud() ? 'Vymazať lokálnu kópiu?' : 'Úplný reset?',
            isCloud()
              ? 'Vymaže sa kópia dát v tomto zariadení a stiahne sa nanovo zo servera. Dáta klubu ostanú nedotknuté.'
              : 'Vymažú sa všetky dáta vrátane účtov trénerov.',
            { danger: true, okLabel: isCloud() ? 'Vymazať kópiu' : 'Resetovať' });
          if (!ok) return;
          resetAll();
          if (isCloud()) resetSyncState();
          location.hash = '';
          location.reload();
        },
      }),
    ),
  );
}

function importFlow() {
  const input = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (!isCloud()) {
        importJSON(text);
        toast('Dáta obnovené');
        location.reload();
        return;
      }

      // V cloude obnova nezasiahne len toto zariadenie, ale celý klub —
      // preto sa pýtame jasne a hovoríme, čo sa stane.
      const ok = await confirmSheet('Obnoviť dáta zo zálohy?',
        'Obsah zálohy sa nahrá do tohto zariadenia a potom aj na server, takže ho uvidia všetci tréneri. '
        + 'Čo je dnes v databáze navyše oproti zálohe, ostane — obnova dáta dopĺňa a prepisuje, nemaže. '
        + 'Použite len zálohu z tejto appky.',
        { danger: true, okLabel: 'Obnoviť' });
      if (!ok) return;

      const { zaznamov, preskocenychTrenerov } = importJSONToCloud(text);
      toast(`Obnovených ${zaznamov} záznamov — odosielam na server`);
      if (preskocenychTrenerov) {
        setTimeout(() => toast(`${preskocenychTrenerov} trénerov zo zálohy server nepozná — preskočení`), 2600);
      }
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      toast(`Chyba: ${e.message}`);
    }
  });
  document.body.append(input);
  input.click();
  setTimeout(() => input.remove(), 60000);
}
