# KluBook

Klubová appka 1. Šachového klubu Košice — **dochádzka trénerov, dochádzka žiakov,
evidencia platieb**. Interný nástroj pre trénerov, nie pre rodičov ani verejnosť.

PWA bez build kroku: obyčajné HTML/CSS/JS súbory, jeden kód pre iOS, Android aj prehliadač.
Funguje offline, inštaluje sa na plochu telefónu.

**Chcete to spustiť naostro? Choďte rovno na [NASADENIE.md](NASADENIE.md).**

---

## Dva režimy

| | Demo | Cloud |
|---|---|---|
| Kedy | `js/config.js` je prázdny | `js/config.js` vyplnený |
| Dáta | len v tomto zariadení | spoločná databáza (Supabase) |
| Prihlásenie | výber trénera + PIN 1234 | e-mail a heslo, potom PIN zariadenia |
| Na čo je | ukážka, skúšanie | ostrá prevádzka |

Prepnutie medzi nimi = vyplnenie dvoch riadkov v `js/config.js`. Nič iné.

---

## Spustenie lokálne

```bash
cd ~/Documents/klubook && python3 -m http.server 4173
```

Otvorte <http://localhost:4173>. (Cez `file://` to nepôjde — appka používa ES moduly
a service worker, tie potrebujú http server.) Alebo dvojklik na `start.command`.

---

## Čo appka vie

| Funkcia | Kde |
|---|---|
| Prihlásenie bez verejnej registrácie | úvodná obrazovka |
| Dochádzka trénerov — štart/stop s časomerom alebo spätný ručný záznam | *Tréning* |
| Zoznam žiakov po skupinách, pridať/upraviť/deaktivovať/vymazať | *Žiaci* |
| Dochádzka žiakov jedným ťuknutím, predvolene sú všetci prítomní | detail tréningu |
| Platby po mesiacoch + farebná bodka pri mene počas tréningu | *Platby* |
| Prehľady: odučené hodiny, účasť žiakov, história platieb, export CSV | *Prehľady* |
| Účty, synchronizácia, nastavenia klubu, zálohy | *Viac* |

---

## Štruktúra projektu

```
index.html              app shell
manifest.webmanifest    PWA manifest
sw.js                   service worker (offline)
css/app.css             dizajn systém
js/config.js            ★ jediný súbor, ktorý upravujete (pripojenie k databáze)
js/app.js               shell, router, spodná navigácia, stav synchronizácie
js/store.js             dáta, dopyty, zmeny, prihlásenie
js/api.js               komunikácia so Supabase + šifrovaný PIN trezor
js/sync.js              offline fronta, odosielanie a sťahovanie zmien
js/router.js            hash router
js/ui.js                UI pomôcky (el, sheet, toast, dátumy, CSV)
js/views/               login, training, students, payments, rebricek, points, reports, settings
sql/01-schema.sql       ★ tabuľky + bezpečnostné pravidlá (vložiť do Supabase)
sql/02-pridat-trenera.sql  ★ pridanie trénera
sql/03..09              neskoršie rozšírenia (naposledy 09 = XP, levely, goldy, obchod)
icons/                  ikony appky
NASADENIE.md            návod krok za krokom
```

---

## Ako je to poskladané

**Offline-first.** Obrazovky čítajú dáta synchrónne z lokálnej kópie (`db` v `store.js`),
takže appka reaguje okamžite aj bez signálu. Zmena sa zapíše lokálne, zaradí do fronty
(`sync.js`) a odošle na server, keď to ide. Preto pribudol cloud bez prepisovania obrazoviek.

**Dátový model** zodpovedá tabuľkám v databáze 1:1:

```
trainers   id (= účet v Supabase Auth), name, initials, active
groups     id, name, short, ord
students   id, name, group_id, contact_name, contact_phone, contact_email,
           note, start_date, active
sessions   id, trainer_id, group_id, date, start_time, end_time, note
attendance id, session_id, student_id, present, at      · unikátne (session, student)
payments   id, student_id, period, status, paid_date, amount, note
                                                        · unikátne (student, period)
club_settings  club_name, short_name, motto, fee
```

**Bezpečnosť** je popísaná v [NASADENIE.md](NASADENIE.md) — v skratke: prihlásenie overuje
server, prístup k dátam stráži Row Level Security v databáze, PIN je šifrovací kľúč
k uloženému prihláseniu, nie kozmetický zámok.

---

## Dizajn

Nadväzuje na klubový web 1skke.sk: pozadie `#FBF3EE`, plochy `#F3E2D8`, text `#2B2320`,
akcent terakota `#C4573B`, nadpisy **Fraunces**, telo **Inter**.
Tón teplý a jednoduchý — nástroj komunity, nie firemný softvér.

---

## Neskoršie rozšírenia

Rodičovský náhľad, notifikácie pred tréningom, viac rolí s rôznymi právami, online platby,
hromadný import žiakov z Excelu. Appku v App Store / Google Play riešiť netreba —
ikona na ploche robí to isté; ak by ju klub raz chcel, kód sa zabalí Capacitorom bez zmien.
