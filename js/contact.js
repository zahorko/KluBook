/* =========================================================
   contact.js — spojenie s rodičom (hovor, SMS, e-mail)
   ---------------------------------------------------------
   Appka nikdy nič neodosiela sama. Len otvorí telefónnu alebo
   SMS aplikáciu s pripraveným textom — odoslanie potvrdzuje
   tréner sám, takže si text môže ešte upraviť.
   ========================================================= */
import { el, mount, sheet, toast } from './ui.js';

/** Číslo bez medzier a pomlčiek, aby sa dalo vytočiť. */
export const cistecislo = (phone = '') => phone.replace(/[^\d+]/g, '');

export const telHref = (phone) => `tel:${cistecislo(phone)}`;

/* `?&body=` funguje na iPhone aj Androide, samotné `?body=` nie vždy. */
export const smsHref = (phone, text) =>
  `sms:${cistecislo(phone)}?&body=${encodeURIComponent(text)}`;

export const mailtoHref = (email, subject, body) =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const maKontakt = (student) => Boolean(student?.contactPhone || student?.contactEmail);

/**
 * Otvorí hárok s pripravenou správou.
 * @param {object} student
 * @param {{title?: string, subject?: string, text?: string}} opts
 */
export function contactSheet(student, { title = 'Ozvať sa rodičovi', subject = 'Šachový klub', text = '' } = {}) {
  const telefon = student.contactPhone?.trim();
  const email = student.contactEmail?.trim();

  if (!telefon && !email) {
    toast('Žiak nemá vyplnený kontakt — doplňte ho v jeho karte');
    return;
  }

  sheet(title, (body, close) => {
    const sprava = el('textarea.textarea', { style: { minHeight: '120px' } }, text);

    const otvor = (href) => {
      close();
      window.location.href = href;
    };

    mount(body,
      el('p.small.muted', { style: { margin: 0 },
        text: `${student.contactName || 'Kontakt'}${telefon ? ` · ${telefon}` : ''}` }),

      text ? el('label.field', {},
        el('span.field__label', { text: 'Text správy (pred odoslaním ho ešte môžete upraviť)' }),
        sprava,
      ) : null,

      telefon ? el('button.btn.btn--block', {
        text: '📞 Zavolať',
        onclick: () => otvor(telHref(telefon)),
      }) : null,

      telefon ? el('button.btn.btn--soft.btn--block', {
        text: '💬 Otvoriť SMS s týmto textom',
        onclick: () => otvor(smsHref(telefon, sprava.value)),
      }) : null,

      email ? el('button.btn.btn--ghost.btn--block', {
        text: '✉️ Napísať e-mail',
        onclick: () => otvor(mailtoHref(email, subject, sprava.value)),
      }) : null,

      el('p.tiny.faint', { style: { marginBottom: 0 },
        text: 'Nič sa neodošle samo — otvorí sa vám telefón alebo SMS aplikácia a odoslanie potvrdíte vy.' }),
    );
  });
}

/* ---------------- pripravené texty ---------------- */

/* Texty sú zámerne formulované tak, aby sa v nich nemuseli skloňovať
   mená ani názov klubu — inak by z toho vychádzali paškvily. */

const podpis = (trener, klub) => `Dobrý deň, tu ${trener} — ${klub}.`;

export const textVymeskavanie = (student, klub, trener) =>
  `${podpis(trener, klub)} `
  + `${student.name.split(' ')[0]} nám v poslednom čase na tréningoch chýba — je všetko v poriadku? `
  + 'Dajte mi prosím vedieť, či bude pokračovať. Ďakujem.';

export const textPlatba = (student, pocetTreningov, suma, klub, trener) =>
  `${podpis(trener, klub)} `
  + `${student.name} má zatiaľ neuhradené ${pocetTreningov} `
  + `${pocetTreningov === 1 ? 'tréning' : pocetTreningov < 5 ? 'tréningy' : 'tréningov'}, spolu ${suma} €. `
  + 'Poprosím o úhradu, ďakujem pekne.';
