# KluBook — návod na spustenie naostro

Postup je písaný tak, aby sa dal odklikať bez programovania.
Celé to zaberie zhruba **30–45 minút**. Ak sa niekde zaseknete, pošlite screenshot.

Poradie krokov nie je náhodné — každý stavia na predchádzajúcom.

---

## Krok 1 — Databáza (Supabase)

1. Otvorte <https://supabase.com> → váš projekt (ten, čo ste už vytvorili).
2. Skontrolujte, že región je **EU (Frankfurt)**. Nájdete ho v *Project Settings → General*.
   Ak by bol iný, vytvorte radšej nový projekt s EU regiónom — evidujete kontakty na deti,
   dáta majú ostať v EÚ.
3. Vľavo kliknite na **SQL Editor** → **New query**.
4. Otvorte súbor [`sql/01-schema.sql`](sql/01-schema.sql), skopírujte **celý jeho obsah**,
   vložte do okna a kliknite **Run** (vpravo dole).
5. Malo by sa vypísať `Success. No rows returned`. Tým sú tabuľky aj bezpečnostné pravidlá hotové.

Overenie: vľavo **Table Editor** → mali by ste vidieť tabuľky `trainers`, `groups`, `students`,
`sessions`, `attendance`, `payments`, `club_settings`. V `groups` sú tri riadky so skupinami.

---

## Krok 2 — Vypnúť verejnú registráciu

Toto je dôležité pre bezpečnosť: bez toho by si účet mohol založiť ktokoľvek.

1. **Authentication → Sign In / Providers** (v novších verziách *Providers → Email*).
2. Vypnite **Allow new users to sign up** (*Enable sign ups*).
3. Uložte.

Od tejto chvíle účty vznikajú len tak, že ich ručne založíte vy.

---

## Krok 3 — Vytvoriť účet pre seba

1. **Authentication → Users → Add user → Create new user**.
2. Zadajte svoj e-mail a heslo (aspoň 8 znakov, pokojne z generátora hesiel).
3. Zaškrtnite **Auto Confirm User** — inak by systém čakal na potvrdenie e-mailu.
4. **Create user**.

---

## Krok 4 — Prepojiť účet s appkou

Samotný účet ešte nestačí, KluBook potrebuje vedieť, že ste tréner.

1. **SQL Editor → New query**.
2. Otvorte [`sql/02-pridat-trenera.sql`](sql/02-pridat-trenera.sql), skopírujte obsah a v ňom prepíšte:
   - `'sem@vlozte-email.sk'` → váš e-mail z kroku 3,
   - `'Jakub Zahorček'` → vaše meno,
   - `'JZ'` → vaše iniciály.
3. **Run**. Dole sa vypíše tabuľka s vaším menom a e-mailom — to je potvrdenie, že to sedí.

Ten istý súbor použijete neskôr pre každého ďalšieho trénera (kroky 3 a 4 zopakujete).

---

## Krok 5 — Prepojiť appku s databázou

Potrebujete dve hodnoty. V novom rozhraní Supabase každá býva inde.

**Project URL** — *Settings → Data API*, hneď hore.
Rovnakú adresu si viete prečítať aj z adresného riadku dashboardu: v adrese
`supabase.com/dashboard/project/**bjxliokrzqlwaqkanbil**/...` je tučná časť kód vášho
projektu a adresa je potom:

```
https://bjxliokrzqlwaqkanbil.supabase.co
```

**Kľúč** — *Settings → API Keys*, záložka *Publishable and secret API keys* →
**Publishable key** (začína `sb_publishable_...`). Skopírujte ho ikonkou vedľa.

> Pozor: **Publishable key**, nie **Secret key** (`sb_secret_...`). Secret key obchádza všetky
> bezpečnostné pravidlá a do appky nikdy nepatrí. Publishable key je verejný zámerne — dáta
> chránia pravidlá v databáze, ktoré ste nastavili v kroku 1. Preto bol krok 1 prvý.
>
> Ak máte starší projekt, na záložke *Legacy anon, service_role API keys* nájdete kľúč
> `anon public` začínajúci `eyJ...` — ten funguje rovnako.

Obe hodnoty vložte do súboru [`js/config.js`](js/config.js) medzi apostrofy:

```js
export const CONFIG = {
  supabaseUrl: 'https://bjxliokrzqlwaqkanbil.supabase.co',
  supabaseKey: 'sb_publishable_bzA2Ockd0EB0BfRq7mQ5lw_oFpij...',
  syncIntervalSeconds: 60,
};
```

Uložte súbor. Appka je teraz cloudová — pri ďalšom otvorení už bude pýtať e-mail a heslo
namiesto demo PIN-u.

---

## Krok 6 — Nahrať kód na GitHub

1. <https://github.com> → **New repository** → názov napr. `klubook` → **Private** → *Create*.
2. Na stránke nového repozitára kliknite **uploading an existing file**.
3. Pretiahnite do okna **celý obsah** priečinka `klubook` (všetky súbory aj priečinky).
4. **Commit changes**.

Prečo GitHub: je to záloha kódu a zároveň zdroj, z ktorého bude web automaticky aktualizovaný.
Dáta žiakov tu nikdy nebudú, tie žijú výhradne v Supabase.

---

## Krok 7 — Zverejniť appku (Cloudflare Pages)

1. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Povoľte prístup k svojmu GitHub účtu a vyberte repozitár `klubook`.
3. Nastavenia buildu nechajte prázdne:
   - Framework preset: **None**
   - Build command: *(prázdne)*
   - Build output directory: `/`
4. **Save and Deploy**. O chvíľu dostanete adresu typu `klubook-abc.pages.dev` — appka je online.

Odteraz platí: čokoľvek nahráte na GitHub, je do minúty aj na webe.

---

## Krok 8 — Vlastná adresa `appka.1skke.sk` (nepovinné, zadarmo)

1. V projekte Pages → **Custom domains** → **Set up a domain** → zadajte `appka.1skke.sk`.
2. Cloudflare vám ukáže, aký **CNAME záznam** pridať u správcu domény 1skke.sk.
3. Po pridaní počkajte pár minút; HTTPS certifikát sa vybaví sám.

---

## Krok 9 — Prvé prihlásenie a inštalácia do telefónu

1. Otvorte adresu appky v telefóne.
2. Prihláste sa e-mailom a heslom z kroku 3.
3. Appka ponúkne **nastavenie PIN-u** pre toto zariadenie — odporúčam nastaviť.
   Odvtedy sa prihlásite štyrmi číslicami, heslo už nebudete potrebovať.
4. Pridajte si ikonu na plochu:
   - **iPhone (Safari):** Zdieľať → *Pridať na plochu*
   - **Android (Chrome):** menu ⋮ → *Inštalovať aplikáciu*

Každý tréner si na svojom telefóne nastaví **vlastný PIN** — PIN patrí zariadeniu, nie účtu.

---

## Krok 10 — Naplniť žiakov

V appke *Žiaci → Pridať žiaka*. Skupiny sú pripravené.
Ak by ste chceli hromadný import zo zošita alebo Excelu, ozvite sa — dá sa to spraviť
jedným SQL príkazom.

---

# Keď niečo nejde

### „Invalid API key" / „Server neprijal kľúč"
Kľúč v `js/config.js` je skopírovaný neúplne. Supabase ho v tabuľke zobrazuje **skrátený**
a končí bodkami (`sb_publishable_bzA2Ockd0EB0…`). Ak ho označíte myšou, skopírujete len
tento orezaný text.

Riešenie: v Supabase kliknite na **ikonu kopírovania** hneď vedľa kľúča — tá skopíruje celý.
V `config.js` nesmú byť na konci žiadne bodky.

### Appka ukazuje výber trénerov a PIN 1234
Je v demo režime, teda `js/config.js` nie je vyplnený správne. Appka na to od tejto verzie
sama upozorní červeným rámčekom na prihlasovacej obrazovke — text v ňom hovorí, čo opraviť.

### Chcem na jednom počítači prepínať trénerov
Použite **Viac → Zamknúť**. Appka sa vráti na prihlasovaciu obrazovku a zobrazí zoznam
trénerov, ktorí sa na tomto zariadení už prihlásili — každý má vlastný PIN. Nový tréner
sa pridá cez *Prihlásiť iného trénera* (e-mail a heslo, potom si nastaví svoj PIN).

**„Odhlásiť sa"** je niečo iné: zmaže vaše prihlásenie aj PIN z tohto zariadenia, takže
nabudúce budete potrebovať heslo. Používajte ho, keď zariadenie opúšťate nadobro
(cudzí počítač, predaj telefónu).

### Po čase ma to odhlásilo a pýta si heslo
Toto bola chyba v starších verziách (trezor si držal už neplatný token) a je opravená.
Ak by sa to zopakovalo, znamená to, že prihlásenie naozaj vypršalo — stačí sa raz prihlásiť
heslom a nastaviť PIN znova.

Appka sa **zámerne zamkne po 12 hodinách nečinnosti** a pýta PIN. Nie je to odhlásenie,
dáta ani prihlásenie sa nestrácajú.

### „Účet ešte nie je aktivovaný"
Prihlásenie prebehlo, ale účet nie je v tabuľke `trainers`. Chýba **krok 4**.

### Zmeny sa neukazujú kolegovi
Pozrite indikátor vpravo hore. Ak ukazuje číslo alebo `!`, zmeny ešte čakajú na odoslanie —
appka je bez pripojenia alebo sa nevie dostať na server. Po pripojení sa odošlú samé,
prípadne ťuknite na indikátor.

### Na webe je stále stará verzia
Nahrajte zmenené súbory na GitHub a v `sw.js` zvýšte číslo `CACHE`
(napr. `klubook-v3` → `klubook-v4`). Telefóny si inak môžu držať staré súbory z pamäte.

---

# Bežná prevádzka

### Pridanie ďalšieho trénera
Zopakujte **krok 3** (účet v Supabase) a **krok 4** (zápis do tabuľky trainers).
Trénerovi pošlite adresu appky a jeho heslo. Pri prvom prihlásení nech si ho zmení
v *Viac → Zmeniť heslo*.

### Odobratie trénera
V SQL Editore spustite (v `02-pridat-trenera.sql` je to pripravené dole):

```sql
update public.trainers set active = false
where id = (select id from auth.users where email = 'byvaly@trener.sk');
```

História jeho tréningov ostane zachovaná, prístup stratí.

### Aktualizácia appky
Nahrajte zmenené súbory na GitHub. Aby telefóny určite načítali novú verziu,
zvýšte v [`sw.js`](sw.js) číslo `CACHE` (napr. `klubook-v3` → `klubook-v4`).

---

# Ako to funguje, keď vypadne signál

KluBook zapisuje najprv do telefónu, až potom na server — takže v telocvični s jednou čiarkou
signálu funguje úplne normálne. Neodoslané zmeny čakajú vo fronte a odošlú sa samé,
keď sa pripojenie vráti.

V pravom hornom rohu je malý indikátor:

| Zobrazenie | Význam |
|---|---|
| ✓ zelená | všetko je odoslané |
| číslo | toľko zmien čaká na odoslanie |
| ↻ | práve prebieha synchronizácia |
| ! červená | server nie je dostupný |

Ťuknutím naň vynútite synchronizáciu. To isté nájdete v *Viac → Synchronizácia*.

**Jediná vec, na ktorú si dať pozor:** ak máte neodoslané zmeny, neodhlasujte sa a nemažte
dáta prehliadača — prišli by ste o ne. Appka vás pri odhlásení upozorní.

Ak by dvaja tréneri upravili to isté naraz, platí neskorší zápis.

---

# Bezpečnosť — čo je zariadené

- Prihlásenie overuje server (Supabase Auth), nie telefón.
- Databáza má zapnuté **Row Level Security**: kto nie je v tabuľke `trainers` a nemá `active = true`,
  nedostane ani riadok. Chráni to databáza samotná, nie appka.
- PIN neodomyká appku „naoko" — je ním zašifrované uložené prihlásenie (PBKDF2 + AES-GCM).
  Bez správneho PIN-u sa z telefónu nedá získať nič použiteľné. Po 5 nesprávnych pokusoch
  sa uložené prihlásenie zmaže a treba zadať heslo.
- Komunikácia ide výhradne cez HTTPS, dáta sú v EÚ.
- Verejná registrácia je vypnutá, účty zakladá výhradne správca.

**Čo ešte odporúčam klubu:** appka obsahuje osobné údaje detí a kontakty na rodičov.
Majte na to súhlas rodičov a heslá si tréneri nech neposielajú cez otvorené skupinové chaty.

---

# Ceny

| Položka | Cena |
|---|---|
| Cloudflare Pages (hosting) | 0 € |
| Supabase Free (databáza + prihlásenie) | 0 € |
| GitHub (súkromný repozitár) | 0 € |
| `appka.1skke.sk` | 0 € (doménu už máte) |

**Jedno upozornenie:** projekt v Supabase zadarmo sa **uspí po týždni bez použitia**.
Počas sezóny sa to nestane. Cez letné prázdniny áno — dáta sa nestratia, len projekt
v Supabase jedným klikom zobudíte (*Restore project*). Ak by to prekážalo, plán Pro
stojí 25 $/mesiac a rieši aj denné zálohy.

Limity bezplatného plánu (500 MB dát, 50 000 prihlásení mesačne) sú pre klub vašej veľkosti
rádovo mimo dosahu — aj s desiatimi trénermi a stovkou žiakov.
