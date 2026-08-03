/* =========================================================
   Nastavenia — účet, synchronizácia, tréneri, klub, dáta
   ========================================================= */
import { el, mount, toast, sheet, confirmSheet, field, textInput, downloadFile } from '../ui.js';
import {
  db, isCloud, saveNow, logout, initialsOf, uid, newSalt, hashPin, setDemoPin,
  exportJSON, importJSON, resetAll, clearDemoData, todayISO,
  updateSettings, updateTrainer, applyServerData, syncNow,
  setDevicePin, hasDevicePin, devicePinEmail, lockApp,
  studentById, groupName,
} from '../store.js';
import { changePassword, session } from '../api.js';
import { state as syncState, onSyncChange, resetSyncState, retryFailed, clearFailed } from '../sync.js';
import { go, refresh } from '../router.js';

export function renderSettings(root, trainer) {
  mount(root, el('div.stack-lg', {},
    accountCard(trainer),
    isCloud() ? syncCard() : null,
    trainersCard(),
    clubCard(),
    dataCard(),
    el('p.tiny.faint.center', {
      text: `KluBook · ${db.settings.clubName} · ${isCloud() ? 'pripojené k databáze' : 'demo režim'}`,
    }),
  ));
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
        ? el('button.btn.btn--soft.btn--block', {
          text: '🔒 Zamknúť (odovzdať zariadenie kolegovi)',
          onclick: () => {
            lockApp();
            toast('Zamknuté');
            go('/');
            refresh();
          },
        })
        : null,
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
    body.append(
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
    body.append(
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
    body.append(
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

  return el('div', {},
    el('h2.section-title', { text: 'Synchronizácia' }),
    el('div.card.stack', {},
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
    body.append(
      el('p.small.muted', { style: { margin: 0 },
        text: 'Tieto zmeny sa nepodarilo dostať na server. Sú uložené v tomto zariadení — '
          + 'skúste ich odoslať znova, alebo ich zadajte ručne a zoznam vyčistite.' }),
      el('div.card.card--flush.list', {},
        syncState.failed.map((f) =>
          el('div.item', {},
            el('span.grow', {},
              el('div.item__title', { text: popisZmeny(f) }),
              el('div.item__sub', { style: { color: 'var(--red)' }, text: f.error ?? 'neznáma chyba' }),
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
              el('div.item__title', { text: t.name }),
              el('div.item__sub', { text: t.active ? 'aktívny' : 'neaktívny' }),
            ),
            el('span.chev', { text: '›' }),
          ),
        ),
      ),
      el('p.tiny.faint', { style: { margin: '10px 2px 0' },
        text: 'Nového trénera pridáte v Supabase (Authentication → Add user) a doplníte do tabuľky trainers. Postup je v NASADENIE.md, krok 5.' }),
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
    body.append(
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

    body.append(
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
      field('Mesačný poplatok (€)', el('input.input', {
        type: 'number', step: '0.5', value: db.settings.fee,
        onchange: (e) => { updateSettings({ fee: Number(e.target.value) || 0 }); toast('Uložené'); },
      })),
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
          ? 'Dáta sú v spoločnej databáze klubu a synchronizujú sa medzi trénermi. Zálohu si môžete stiahnuť ako súbor.'
          : 'Demo režim: dáta sú len v tomto zariadení. Zálohu si stiahnite ako súbor.' }),
      el('button.btn.btn--ghost.btn--block', {
        text: '⤓ Stiahnuť zálohu (JSON)',
        onclick: () => { downloadFile(`klubook-zaloha-${todayISO()}.json`, exportJSON()); toast('Záloha stiahnutá'); },
      }),
      isCloud() ? null : el('button.btn.btn--ghost.btn--block', { text: '⤒ Obnoviť zo zálohy', onclick: importFlow }),
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
      importJSON(await file.text());
      toast('Dáta obnovené');
      location.reload();
    } catch (e) {
      toast(`Chyba: ${e.message}`);
    }
  });
  document.body.append(input);
  input.click();
  setTimeout(() => input.remove(), 60000);
}
