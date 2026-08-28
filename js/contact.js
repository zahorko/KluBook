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

/**
 * Informácia pre rodičov o tom, čo klub o dieťati eviduje. Nie je to súhlas —
 * na bežnú klubovú evidenciu ho netreba, právnym základom je členstvo v klube.
 * Je to splnenie povinnosti rodiča informovať. Text si pred prvým použitím
 * prejdite a doplňte, čo je vo vašom klube inak.
 */
export const textPreRodicov = ({ klub, kontakt = '', roky = 3 }) =>
  `INFORMÁCIA O SPRACÚVANÍ OSOBNÝCH ÚDAJOV\n`
  + `${klub}\n\n`
  + `Čo o dieťati vedieme:\n`
  + `• meno a priezvisko, dátum nástupu do klubu, tréningová skupina\n`
  + `• kontakt na zákonného zástupcu (meno, telefón, e-mail)\n`
  + `• dochádzku na tréningoch a úhrady za odtrénované hodiny\n`
  + `• výsledky na turnajoch a v súťažiach, ktoré dieťa odohrá za klub\n\n`
  + `Prečo to vedieme:\n`
  + `Aby sme vedeli viesť tréningovú činnosť, vyúčtovať úhrady, prihlasovať\n`
  + `deti na súťaže, ozvať sa vám a preukázať činnosť klubu (napr. pri dotáciách).\n`
  + `Právnym základom je členský vzťah dieťaťa v klube a naše oprávnené záujmy\n`
  + `pri jeho vedení. O súhlas vás preto nežiadame — ak by sme chceli údaje\n`
  + `použiť inak (napríklad zverejniť fotografiu), spýtame sa osobitne.\n\n`
  + `Kto sa k tomu dostane:\n`
  + `Iba tréneri klubu. Údaje sú v aplikácii chránenej prihlásením a neposielame\n`
  + `ich nikomu ďalšiemu. Výnimkou sú prihlášky na súťaže, kde meno a rok\n`
  + `narodenia potrebuje organizátor a šachový zväz.\n\n`
  + `Ako dlho:\n`
  + `Počas členstva a ${roky} roky po jeho ukončení. Potom osobné údaje mažeme;\n`
  + `zostávajú len súhrnné štatistiky bez mena.\n\n`
  + `Vaše práva:\n`
  + `Môžete si vyžiadať, aké údaje o dieťati vedieme, dať ich opraviť alebo\n`
  + `vymazať, prípadne namietať proti ich spracúvaniu. Stačí sa ozvať`
  + `${kontakt ? ` na ${kontakt}` : ' trénerovi'}.\n`;

export const textVymeskavanie = (student, klub, trener) =>
  `${podpis(trener, klub)} `
  + `${student.name.split(' ')[0]} nám v poslednom čase na tréningoch chýba — je všetko v poriadku? `
  + 'Dajte mi prosím vedieť, či bude pokračovať. Ďakujem.';

export const textPlatba = (student, pocetTreningov, suma, klub, trener) =>
  `${podpis(trener, klub)} `
  + `${student.name} má zatiaľ neuhradené ${pocetTreningov} `
  + `${pocetTreningov === 1 ? 'tréning' : pocetTreningov < 5 ? 'tréningy' : 'tréningov'}, spolu ${suma} €. `
  + 'Poprosím o úhradu, ďakujem pekne.';
