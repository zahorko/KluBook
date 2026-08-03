/* =========================================================
   Prihlásenie
   ---------------------------------------------------------
   CLOUD: prvýkrát na zariadení e-mailom a heslom, potom si
          tréner nastaví PIN a ďalej sa prihlasuje len ním.
          PIN nie je „skrytý zámok" — odomyká ním zašifrované
          prihlásenie uložené v zariadení (viď api.js).
   DEMO:  výber trénera + PIN 1234.
   ========================================================= */
import { el, mount, toast, field } from '../ui.js';
import { configProblem } from '../config.js';
import {
  db, isCloud, demoLogin, signInWithPassword, unlockWithPin,
  setDevicePin, hasDevicePin, devicePinAccounts, forgetDevicePin,
} from '../store.js';
import { refresh } from '../router.js';

export function renderLogin(root) {
  const wrap = el('div.login');
  const inner = el('div.login__inner');
  wrap.append(inner);
  mount(root, wrap);

  const header = (title, sub) => el('div.center', {},
    el('div.login__logo', { text: '♟' }),
    el('h1.login__title', { text: title }),
    el('p.login__tag', { text: sub }),
  );

  /** Upozornenie na preklep v js/config.js — nech tréner netipuje, čo je zle. */
  const configWarning = () => {
    const problem = configProblem();
    if (!problem) return null;
    return el('div.card', {
      style: { background: 'var(--red-l)', borderColor: 'transparent', marginBottom: '14px' },
    },
      el('div', { style: { fontWeight: '600', marginBottom: '4px' }, text: '⚠ Chyba v nastavení' }),
      el('div.small', { text: problem }),
    );
  };

  /* ---------------- CLOUD ---------------- */

  const showPasswordForm = () => {
    const email = el('input.input', { type: 'email', autocomplete: 'username', placeholder: 'meno@email.sk' });
    const password = el('input.input', { type: 'password', autocomplete: 'current-password', placeholder: '••••••••' });
    const error = el('p.small', { style: { color: 'var(--red)', minHeight: '18px', margin: '0 2px' } });
    const button = el('button.btn.btn--block', { text: 'Prihlásiť sa' });

    const submit = async () => {
      error.textContent = '';
      if (!email.value.trim() || !password.value) {
        error.textContent = 'Vyplňte e-mail aj heslo.';
        return;
      }
      button.disabled = true;
      button.textContent = 'Prihlasujem…';
      try {
        const trainer = await signInWithPassword(email.value, password.value);
        password.value = '';
        showPinSetup(trainer);
      } catch (e) {
        error.textContent = e.message;
        button.disabled = false;
        button.textContent = 'Prihlásiť sa';
      }
    };

    button.addEventListener('click', submit);
    password.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    email.addEventListener('keydown', (e) => { if (e.key === 'Enter') password.focus(); });

    mount(inner,
      header('KluBook', db.settings.motto),
      configWarning(),
      el('div.stack', {},
        field('E-mail', email),
        field('Heslo', password),
        error,
        button,
        hasDevicePin()
          ? el('button.btn.btn--ghost.btn--block', { text: '‹ Späť na PIN', onclick: showPinUnlock })
          : null,
      ),
      el('p.tiny.faint.center', {
        style: { marginTop: '20px' },
        text: 'Účty zakladá správca klubu. Ak heslo nemáte, ozvite sa mu.',
      }),
    );
    email.focus();
  };

  const showPinSetup = (trainer) => {
    const finish = () => { location.hash = '#/trening'; refresh(); };

    const p1 = el('input.input', { type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: '••••' });
    const p2 = el('input.input', { type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: '••••' });
    const error = el('p.small', { style: { color: 'var(--red)', minHeight: '18px', margin: '0 2px' } });

    mount(inner,
      el('div.center', {},
        el('span.avatar', { text: trainer?.initials ?? '?', style: { margin: '0 auto' } }),
        el('h1.login__title', { text: 'Prihlásený', style: { fontSize: '22px' } }),
        el('p.login__tag', { text: trainer?.name ?? '' }),
      ),
      el('div.card.stack', {},
        el('p.small.muted', { style: { margin: 0 },
          text: 'Nastavte si PIN pre toto zariadenie. Nabudúce sa prihlásite len ním, heslo už nebudete potrebovať.' }),
        field('PIN (4 číslice)', p1),
        field('Zopakujte PIN', p2),
        error,
        el('button.btn.btn--block', {
          text: 'Nastaviť PIN a pokračovať',
          onclick: async () => {
            if (!/^\d{4}$/.test(p1.value)) { error.textContent = 'PIN musí mať 4 číslice.'; return; }
            if (p1.value !== p2.value) { error.textContent = 'PIN-y sa nezhodujú.'; return; }
            await setDevicePin(p1.value, { name: trainer?.name ?? '', initials: trainer?.initials ?? '?' });
            toast('PIN nastavený');
            finish();
          },
        }),
        el('button.btn.btn--ghost.btn--block', { text: 'Preskočiť', onclick: finish }),
      ),
    );
    p1.focus();
  };

  /* Na klubovom počítači môže mať PIN uložený viac trénerov. */
  const showAccountPicker = () => {
    mount(inner,
      header('KluBook', db.settings.motto),
      configWarning(),
      el('p.field__label', { text: 'Prihlásiť sa ako', style: { textAlign: 'center' } }),
      el('div.trainer-pick', {},
        devicePinAccounts().map((acc) =>
          el('button.trainer-pick__btn', { onclick: () => showPinUnlock(acc) },
            el('span.avatar', { text: acc.initials }),
            el('span.grow', {},
              el('div', { text: acc.name, style: { fontWeight: '500' } }),
              el('div.tiny.faint', { text: acc.email }),
            ),
            el('span.chev', { text: '›' }),
          ),
        ),
      ),
      el('button.btn.btn--ghost.btn--block', {
        style: { marginTop: '14px' },
        text: '＋ Prihlásiť iného trénera',
        onclick: showPasswordForm,
      }),
    );
  };

  const showPinUnlock = (account) => {
    let pin = '';
    const dots = el('div.pinrow');
    const error = el('p.small.center', { style: { color: 'var(--red)', minHeight: '18px' } });
    const viacUctov = devicePinAccounts().length > 1;

    const paint = (err = false) => {
      mount(dots, [0, 1, 2, 3].map((i) =>
        el('span', { class: `pindot${err ? ' pindot--err' : i < pin.length ? ' pindot--on' : ''}` })));
    };

    const submit = async () => {
      try {
        await unlockWithPin(account.email, pin);
        location.hash = '#/trening';
        refresh();
      } catch (e) {
        paint(true);
        dots.classList.add('shake');
        error.textContent = e.message;
        setTimeout(() => { dots.classList.remove('shake'); pin = ''; paint(); }, 420);
        // zlý PIN = skúšame znova; čokoľvek iné (vypršané prihlásenie,
        // vyčerpané pokusy) rieši prihlásenie heslom
        if (e.code !== 'BAD_PIN' || !hasDevicePin()) {
          setTimeout(() => { toast(e.message); showPasswordForm(); }, 1000);
        }
      }
    };

    const press = (digit) => {
      if (pin.length >= 4) return;
      pin += digit;
      error.textContent = '';
      paint();
      if (pin.length === 4) setTimeout(submit, 140);
    };

    mount(inner,
      el('div.center', {},
        el('span.avatar', { text: account.initials, style: { margin: '0 auto' } }),
        el('h1.login__title', { text: account.name, style: { fontSize: '22px' } }),
        el('p.tiny.faint', { text: account.email }),
      ),
      dots,
      error,
      el('div.keypad', {},
        ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) =>
          el('button.key', { text: n, onclick: () => press(n) })),
        el('button.key.key--soft', {
          text: viacUctov ? 'Späť' : 'Heslo',
          onclick: viacUctov ? showAccountPicker : showPasswordForm,
        }),
        el('button.key', { text: '0', onclick: () => press('0') }),
        el('button.key.key--soft', { text: '⌫', onclick: () => { pin = pin.slice(0, -1); paint(); } }),
      ),
      el('button.btn.btn--ghost.btn--block', {
        style: { marginTop: '18px' },
        text: 'Zabudnutý PIN — prihlásiť sa heslom',
        onclick: () => { forgetDevicePin(account.email); showPasswordForm(); },
      }),
      viacUctov ? null : el('button.btn.btn--ghost.btn--block', {
        text: 'Prihlásiť iného trénera',
        onclick: showPasswordForm,
      }),
    );
    paint();

    const onKey = (e) => {
      if (!document.body.contains(dots)) { window.removeEventListener('keydown', onKey); return; }
      if (/^[0-9]$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') { pin = pin.slice(0, -1); paint(); }
    };
    window.addEventListener('keydown', onKey);
  };

  /* ---------------- DEMO ---------------- */

  const showTrainerPick = () => {
    mount(inner,
      header(db.settings.clubName, db.settings.motto),
      configWarning(),
      el('p.field__label', { text: 'Prihlásiť sa ako', style: { textAlign: 'center' } }),
      el('div.trainer-pick', {},
        db.trainers.filter((t) => t.active).map((t) =>
          el('button.trainer-pick__btn', { onclick: () => showDemoPin(t) },
            el('span.avatar', { text: t.initials }),
            el('span.grow', {},
              el('div', { text: t.name, style: { fontWeight: '500' } }),
              el('div.tiny.faint', { text: 'Tréner' }),
            ),
            el('span.chev', { text: '›' }),
          ),
        ),
      ),
      el('p.tiny.faint.center', {
        style: { marginTop: '22px' },
        text: 'Demo režim — PIN 1234. Po vyplnení config.js sa appka prepne na spoločnú databázu.',
      }),
    );
  };

  const showDemoPin = (trainer) => {
    let pin = '';
    const dots = el('div.pinrow');
    const paint = (err = false) => {
      mount(dots, [0, 1, 2, 3].map((i) =>
        el('span', { class: `pindot${err ? ' pindot--err' : i < pin.length ? ' pindot--on' : ''}` })));
    };

    const submit = async () => {
      if (await demoLogin(trainer.id, pin)) {
        location.hash = '#/trening';
        refresh();
      } else {
        paint(true);
        dots.classList.add('shake');
        setTimeout(() => { dots.classList.remove('shake'); pin = ''; paint(); }, 420);
        toast('Nesprávny PIN');
      }
    };

    const press = (digit) => {
      if (pin.length >= 4) return;
      pin += digit;
      paint();
      if (pin.length === 4) setTimeout(submit, 140);
    };

    mount(inner,
      el('div.center', {},
        el('span.avatar', { text: trainer.initials, style: { margin: '0 auto' } }),
        el('h1.login__title', { text: trainer.name, style: { fontSize: '22px' } }),
        el('p.tiny.faint', { text: 'Zadajte svoj PIN' }),
      ),
      dots,
      el('div.keypad', {},
        ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) =>
          el('button.key', { text: n, onclick: () => press(n) })),
        el('button.key.key--soft', { text: 'Späť', onclick: showTrainerPick }),
        el('button.key', { text: '0', onclick: () => press('0') }),
        el('button.key.key--soft', { text: '⌫', onclick: () => { pin = pin.slice(0, -1); paint(); } }),
      ),
    );
    paint();

    const onKey = (e) => {
      if (!document.body.contains(dots)) { window.removeEventListener('keydown', onKey); return; }
      if (/^[0-9]$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') { pin = pin.slice(0, -1); paint(); }
    };
    window.addEventListener('keydown', onKey);
  };

  if (!isCloud()) {
    showTrainerPick();
  } else if (hasDevicePin()) {
    const ucty = devicePinAccounts();
    if (ucty.length > 1) showAccountPicker();
    else showPinUnlock(ucty[0]);
  } else {
    showPasswordForm();
  }
}
