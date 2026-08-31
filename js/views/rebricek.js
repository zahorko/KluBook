/* =========================================================
   Rebríček — XP, levely, goldy a klubový obchod
   ---------------------------------------------------------
   Zámer: motivovať deti hrať a chodiť, nie im ukázať, kto je
   posledný. Výskum gamifikácie je v tomto jednoznačný — celkové
   rebríčky najviac škodia práve tým vzadu. Preto má tréner plnú
   tabuľku, ale to, čo sa premieta deťom, ukazuje podium a špičku;
   svoje miesto vidí každý na vlastnej karte.
   ========================================================= */
import {
  el, mount, toast, sheet, confirmSheet, field, textInput, selectInput,
  fmtDate, fmtDayShort, downloadCSV,
} from '../ui.js';
import {
  db, sortedGroups, groupName, seasonRange, rebricek, gamifikacia,
  shopItems, upsertShopItem, deleteShopItem, kupit, nedorucneNakupy, ODPORUCANA_PONUKA,
  oznacitOdovzdane, zrusitNakup, trainsWithClub, isInGroup, todayISO,
  eventsInRange, xpNaDalsiLevel,
} from '../store.js';
import { odznakEl, hodnost, rozsahHodnosti, rozsahKratky, HODNOSTI } from '../odznaky.js';
import { ikona, goldy } from '../ikony.js';
import { znak } from '../znak.js';
import { go, refresh } from '../router.js';
import { eventsSection, seasonSheet } from './points.js';
import { sklonuj } from './training.js';

const VYCHODZI_STAV = { tab: 'tabulka', groupId: null, zoradenie: 'sezona', preDeti: false };
const uiState = { ...VYCHODZI_STAV };

/** Návrat do východzieho stavu — appka to volá, keď sa obrazovka nepodarí
    vykresliť, aby sa nezasekla na tej podzáložke, ktorá padá. */
export const resetStav = () => Object.assign(uiState, VYCHODZI_STAV);

export function renderRebricek(root) {
  const tabs = el('div.pillbar', {},
    [['tabulka', 'rebricek', 'Rebríček'], ['podujatia', 'kalendar', 'Podujatia'], ['obchod', 'gold', 'Obchod']]
      .map(([id, ic, label]) =>
        el('button.pill', {
          'aria-pressed': String(uiState.tab === id),
          onclick: () => { uiState.tab = id; refresh(); },
        }, ikona(ic, { velkost: 16 }), label),
    ),
  );

  // v režime pre deti ide preč všetko trénerské — na stole leží telefón
  // alebo svieti projektor a má tam byť vidieť podium, nie ovládanie appky
  const preDeti = uiState.preDeti && uiState.tab === 'tabulka';

  const body = el('div');
  if (uiState.tab === 'tabulka') body.append(tabulkaTab());
  else if (uiState.tab === 'podujatia') body.append(podujatiaTab());
  else body.append(obchodTab());

  mount(root, el('div.stack-lg', {}, preDeti ? null : tabs, body));
}

/* ---------------- rebríček ---------------- */
function tabulkaTab() {
  const { from, to } = seasonRange();
  const cely = rebricek({ zoradenie: uiState.zoradenie });
  const tabulka = rebricek({ groupId: uiState.groupId, zoradenie: uiState.zoradenie });
  const hraci = tabulka.filter((r) => r.sezona.xp > 0 || r.celkovo.xp > 0);

  return el('div.stack-lg', {},
    uiState.preDeti
      // premieta sa deťom alebo leží na stole — nech je vidieť, že je to klub,
      // nie tabuľka v mobile
      ? el('div.center', { style: { marginBottom: '4px' } },
        znak('znak', { vyska: 54, style: { color: 'var(--terracotta)' } }),
        el('h2', { text: 'Rebríček sezóny', style: { fontSize: '22px', margin: '8px 0 2px' } }),
        el('div.small.muted', { text: `${fmtDate(from)} – ${fmtDate(to)}` }),
      )
      : sezonaKarta(from, to, cely),
    rezimPrepinac(),
    filtre(),
    hraci.length === 0
      ? el('div.empty', {},
        el('span.empty__mark', {}, ikona('rebricek', { velkost: 34 })),
        'Zatiaľ nikto nemá XP. Pribudnú po prvom tréningu alebo podujatí.')
      // Podium ukazujeme len deťom — trénerovi by len zopakovalo prvé tri
      // riadky tabuľky, ktoré aj tak majú medaily.
      : uiState.preDeti ? spickaPreDeti(hraci) : plnaTabulka(hraci),
    hodnostiKarta(hraci),
  );
}

/**
 * Rebrík hodností. Bez neho je odznak len ozdoba — dieťa musí vidieť
 * celú cestu aj to, kde na nej stojí, inak nemá na čo mieriť.
 */
function hodnostiKarta(hraci) {
  const obsadene = new Set(hraci.map((r) => hodnost(r.level).id));
  return el('div', {},
    el('h2.section-title', { text: 'Hodnosti' }),
    el('div.card', {},
      el('div.hodnosti', {}, HODNOSTI.map((h) => el('div.hodnost', {
        style: obsadene.has(h.id) ? { background: h.svetla } : {},
        title: rozsahHodnosti(h),
      },
        odznakEl(h.od, { velkost: 36 }),
        el('div.hodnost__meno', { text: h.nazov }),
        el('div.hodnost__rozsah', { text: rozsahKratky(h) }),
      ))),
      uiState.preDeti ? null : el('p.hint', {
        text: 'Podfarbené sú hodnosti, ktoré už niekto v klube má. Hodnosť sa mení sama '
          + 'podľa levelu — pri jednom až dvoch tréningoch týždenne postúpi dieťa '
          + 'približne raz za pár mesiacov.' }),
    ),
  );
}

function sezonaKarta(from, to, cely) {
  const podujatia = eventsInRange(from, to).length;
  const xpSpolu = cely.reduce((s, r) => s + r.sezona.xp, 0);
  return el('div.card.card--warm.stack', {},
    el('div.row.row--between', {},
      el('div', {},
        el('h2', { text: 'Sezóna', style: { fontSize: '18px' } }),
        el('div.small.muted', { text: `${fmtDate(from)} – ${fmtDate(to)}` }),
      ),
      el('button.btn.btn--ghost.btn--sm', { text: 'Zmeniť', onclick: () => seasonSheet(from, to) }),
    ),
    el('div.stats', {},
      el('div.stat', {}, el('div.stat__num', { text: String(cely.filter((r) => r.sezona.xp > 0).length) }),
        el('div.stat__lab', { text: 'hráčov v hre' })),
      el('div.stat', {}, el('div.stat__num', { text: String(podujatia) }), el('div.stat__lab', { text: 'podujatí' })),
      el('div.stat', {}, el('div.stat__num', { text: String(xpSpolu) }), el('div.stat__lab', { text: 'XP spolu' })),
    ),
  );
}

/** Prepínač medzi trénerským pohľadom a tým, čo sa dá ukázať deťom. */
function rezimPrepinac() {
  return el('div.row', { style: { gap: '8px' } },
    el('button.btn.btn--ghost.btn--sm.grow', {
      style: uiState.preDeti ? { background: 'var(--terracotta-l)', color: 'var(--terracotta-d)', borderColor: 'transparent' } : {},
      onclick: () => { uiState.preDeti = !uiState.preDeti; refresh(); },
    }, ikona('oko', { velkost: 17 }),
      uiState.preDeti ? 'Režim pre deti — zapnutý' : 'Ukázať deťom'),
    uiState.preDeti ? null : el('button.btn.btn--ghost.btn--sm', { text: '⤓ CSV', onclick: () => exportRebricek() }),
  );
}

function filtre() {
  const pill = (label, hodnota, kluc) => el('button.pill', {
    text: label,
    'aria-pressed': String(uiState[kluc] === hodnota),
    onclick: () => { uiState[kluc] = hodnota; refresh(); },
  });
  return el('div.stack', { style: { gap: '8px' } },
    el('div.pillbar', {},
      pill('Táto sezóna', 'sezona', 'zoradenie'),
      pill('Celkovo za klub', 'celkovo', 'zoradenie'),
    ),
    el('div.pillbar', {},
      pill('Všetci', null, 'groupId'),
      sortedGroups().map((g) => pill(g.name, g.id, 'groupId')),
    ),
  );
}

/** Medaila hovorí o poradí, odznak o hodnosti — sú to dve rôzne veci. */
const medaila = (miesto, velkost) => ikona(`medaila${miesto}`, { velkost });

function podium(top) {
  if (!top.length) return null;
  return el('div.card.stack', { style: { background: 'var(--cream-deep)', borderColor: 'transparent' } },
    top.map((r, i) =>
      el('button.row', {
        style: {
          gap: '12px', width: '100%', background: 'var(--white)', border: 0,
          borderRadius: 'var(--r-md)', padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
        },
        onclick: () => go(`/ziaci/${r.student.id}`),
      },
        medaila(i + 1, 30),
        odznakEl(r.level, { velkost: 42, class: 'odznak--velky' }),
        el('span.grow', {},
          el('div', { style: { fontWeight: '600', fontSize: '16px' }, text: r.student.name }),
          el('div.item__sub.item__sub--riadok', {}, `${hodnost(r.level).nazov} ${r.level} · `, goldy(r.gold, { velkost: 13 })),
        ),
        el('span', { style: { textAlign: 'right' } },
          el('div.mono', { style: { fontWeight: '700', fontSize: '18px' },
            text: String(uiState.zoradenie === 'celkovo' ? r.celkovo.xp : r.sezona.xp) }),
          el('div.item__sub', { text: 'XP' }),
        ),
      ),
    ),
  );
}

/** Trénerský pohľad — celé poradie vrátane tých, čo ešte nezačali. */
function plnaTabulka(hraci) {
  return el('div', {},
    el('h2.section-title', { text: uiState.zoradenie === 'celkovo' ? 'Celé poradie za klub' : 'Celé poradie tejto sezóny' }),
    el('div.card.card--flush.list', {}, hraci.map((r) => riadok(r))),
    el('p.hint', {
      text: 'Toto vidíte len vy. Deťom ukazujte režim vyššie — ten ukáže podium a nič viac, '
        + 'celé poradie nikoho nemotivuje odspodu. Svoj level a koľko mu chýba na ďalší '
        + 'nájde každý na svojej karte v Žiakoch.' }),
  );
}

/** Čo sa premieta deťom: špička a nič viac. Svoje miesto si každý pozrie na karte. */
function spickaPreDeti(hraci) {
  const dalsi = hraci.slice(3, 6);
  return el('div.stack-lg', {},
    podium(hraci.slice(0, 3)),
    dalsi.length
      ? el('div', {},
        el('h2.section-title', { text: 'Hneď za nimi' }),
        el('div.card.card--flush.list', {}, dalsi.map((r) => riadok(r))),
      )
      : null,
  );
}

function riadok(r) {
  const xp = uiState.zoradenie === 'celkovo' ? r.celkovo.xp : r.sezona.xp;
  return el('button.item', { onclick: () => go(`/ziaci/${r.student.id}`) },
    el('span', {
      style: {
        minWidth: '30px', textAlign: 'center', fontWeight: '600',
        fontSize: r.poradie <= 3 ? '18px' : '14px',
        color: r.poradie <= 3 ? 'inherit' : 'var(--ink-faint)',
      },
      text: r.poradie <= 3 ? '' : `${r.poradie}.`,
    }, r.poradie <= 3 ? medaila(r.poradie, 22) : null),
    odznakEl(r.level, { velkost: 30 }),
    el('span.grow', {},
      el('div.item__title', {}, r.student.name,
        trainsWithClub(r.student) ? null : el('span.tag', { text: 'netrénuje', style: { marginLeft: '8px' } })),
      el('div.item__sub.item__sub--riadok', {
        text: `${hodnost(r.level).nazov} ${r.level}`
          + ` · ${r.sezona.treningy} ${sklonuj(r.sezona.treningy, 'tréning', 'tréningy', 'tréningov')}`
          + (r.sezona.podujatia
            ? ` · ${r.sezona.podujatia} ${sklonuj(r.sezona.podujatia, 'podujatie', 'podujatia', 'podujatí')}`
            : ''),
      }),
    ),
    el('span', { style: { textAlign: 'right' } },
      el('div.mono', { style: { fontWeight: '700', fontSize: '17px' }, text: String(xp) }),
      el('div.item__sub.row', { style: { gap: '5px', justifyContent: 'flex-end' } }, 'XP · ', goldy(r.gold, { velkost: 13 })),
    ),
  );
}

/* ---------------- podujatia ---------------- */
function podujatiaTab() {
  const { from, to } = seasonRange();
  return el('div.stack-lg', {}, eventsSection(eventsInRange(from, to)));
}

/* ---------------- obchod ---------------- */
function obchodTab() {
  const ponuka = shopItems({ includeInactive: true });
  const caka = nedorucneNakupy();

  return el('div.stack-lg', {},
    el('div.card.stack', {},
      el('p.small.muted', { style: { margin: 0 },
        text: `Za každý level up dostane hráč ${gamifikacia().goldZaLevel} goldov. Za goldy si vyberá z tejto ponuky. `
          + 'Výsady (napr. výber témy tréningu) nič nestoja a deti ich často chcú viac než vecné odmeny.' }),
      el('button.btn.btn--block', { text: '＋ Pridať odmenu do ponuky', onclick: () => itemSheet(null) }),
    ),

    caka.length ? el('div', {},
      el('h2.section-title', { text: `Čaká na odovzdanie · ${caka.length}` }),
      el('div.card.card--flush.list', {}, caka.map((n) =>
        el('div.item', {},
          el('span.grow', {},
            el('div.item__title', { text: n.student.name }),
            el('div.item__sub.row', { style: { gap: '5px' } }, `${n.itemName} · `, goldy(n.price, { velkost: 13 }),
              ` · ${fmtDayShort(String(n.at).slice(0, 10))}`),
          ),
          el('button.btn.btn--sm', {
            text: '✓ Odovzdané',
            onclick: () => { oznacitOdovzdane(n.id); toast('Odovzdané'); refresh(); },
          }),
        ),
      )),
    ) : null,

    el('div', {},
      el('h2.section-title', { text: 'Ponuka obchodu' }),
      ponuka.length === 0
        ? el('div.stack', {},
          el('div.empty', {},
            el('span.empty__mark', {}, ikona('gold', { velkost: 34 })),
            'Ponuka je zatiaľ prázdna. Kým nie je čo kúpiť, goldy nikoho neťahajú.'),
          el('button.btn.btn--soft.btn--block', {
            onclick: () => {
              for (const i of ODPORUCANA_PONUKA) upsertShopItem(i);
              toast(`Pridaných ${ODPORUCANA_PONUKA.length} odmien — ceny si pokojne prepíšte`);
              refresh();
            },
          }, ikona('iskra', { velkost: 17 }), 'Naplniť odporúčanou ponukou'),
          el('p.tiny.faint', { style: { margin: 0 },
            text: 'Lacné sladké a slané na začiatok, výsady v strede, veľké ceny na konci sezóny. Všetko sa dá upraviť aj zmazať.' }),
        )
        : el('div.card.card--flush.list', {}, ponuka.map((i) =>
          el('button.item', { onclick: () => kupitSheet(i) },
            el('span', {
              // ikona je druhoradá, hlavný je názov odmeny — nech ho neprekrikuje
              style: { minWidth: '28px', display: 'grid', placeItems: 'center', color: 'var(--terracotta)' },
            }, ikona(i.kind === 'vyhoda' ? 'vysada' : 'darcek', { velkost: 21 })),
            el('span.grow', {},
              el('div.item__title', {}, i.name,
                i.active === false ? el('span.tag', { text: 'skryté', style: { marginLeft: '8px' } }) : null),
              el('div.item__sub', { text: i.description || (i.kind === 'vyhoda' ? 'klubová výsada' : 'vecná odmena') }),
            ),
            el('span', { style: { textAlign: 'right' } },
              el('div.mono', { style: { fontWeight: '700' } }, goldy(i.price)),
            ),
            el('span.chev', { text: '›' }),
          ),
        )),
    ),
  );
}

/** Kúpa: vyberieme dieťa, ktoré si odmenu berie. Kto na ňu nemá, je vidieť, ale nedá sa zvoliť. */
function kupitSheet(item) {
  sheet(item.name, (body, close) => {
    const zoznam = rebricek({ zoradenie: 'celkovo' });
    const mozu = zoznam.filter((r) => r.gold >= item.price);
    const nemozu = zoznam.filter((r) => r.gold < item.price);

    const riadokHraca = (r, dostupne) => el(dostupne ? 'button.item' : 'div.item', {
      style: dostupne ? {} : { opacity: '.45' },
      onclick: dostupne ? () => {
        try {
          kupit(r.student.id, item.id);
          close();
          toast(`${r.student.name}: ${item.name} za ${item.price} goldov`);
          refresh();
        } catch (e) { toast(e.message); }
      } : undefined,
    },
      odznakEl(r.level, { velkost: 30 }),
      el('span.grow', {},
        el('div.item__title', { text: r.student.name }),
        el('div.item__sub.item__sub--riadok', {}, `${hodnost(r.level).nazov} ${r.level} · zostatok `, goldy(r.gold, { velkost: 13 })),
      ),
      dostupne ? el('span.chev', { text: '›' }) : el('span.tiny.faint', { text: `chýba ${item.price - r.gold}` }),
    );

    mount(body,
      el('div.row.row--between', {},
        el('span.small.muted', { text: item.description || (item.kind === 'vyhoda' ? 'Klubová výsada' : 'Vecná odmena') }),
        el('span.mono', { style: { fontWeight: '700' } }, goldy(item.price)),
      ),
      el('div.row', { style: { gap: '8px' } },
        el('button.btn.btn--ghost.btn--sm.grow', { text: 'Upraviť odmenu', onclick: () => { close(); itemSheet(item); } }),
        el('button.btn.btn--ghost.btn--sm', {
          text: 'Zmazať',
          onclick: async () => {
            close();
            const ok = await confirmSheet('Zmazať odmenu?',
              'Zmizne z ponuky. Už vybrané odmeny ostanú v histórii detí.', { danger: true, okLabel: 'Zmazať' });
            if (!ok) return;
            deleteShopItem(item.id);
            toast('Zmazané');
            refresh();
          },
        }),
      ),
      el('h2.section-title', { text: 'Komu ju dávame?' }),
      mozu.length === 0
        ? el('div.empty', { text: 'Na túto odmenu zatiaľ nikto nemá dosť goldov.' })
        : el('div.card.card--flush.list', {}, mozu.map((r) => riadokHraca(r, true))),
      nemozu.length
        ? el('div', {},
          el('h2.section-title', { text: 'Zatiaľ nemajú dosť' }),
          el('div.card.card--flush.list', {}, nemozu.slice(0, 8).map((r) => riadokHraca(r, false))),
        )
        : null,
    );
  });
}

function itemSheet(item) {
  const novy = !item;
  sheet(novy ? 'Nová odmena' : 'Upraviť odmenu', (body, close) => {
    const name = textInput({ value: item?.name ?? '', placeholder: 'napr. Klubové tričko' });
    const popis = textInput({ value: item?.description ?? '', placeholder: 'krátky popis (nepovinné)' });
    const cena = el('input.input', { type: 'number', min: '0', step: '1', value: String(item?.price ?? 20) });
    const druh = selectInput(
      [{ value: 'vec', label: 'Vecná odmena' }, { value: 'vyhoda', label: 'Klubová výsada (nič nestojí)' }],
      { value: item?.kind ?? 'vec' },
    );
    const viditelne = el('input', {
      type: 'checkbox', checked: item ? item.active !== false : true,
      style: { width: '20px', height: '20px', accentColor: 'var(--terracotta)' },
    });

    mount(body,
      field('Názov *', name),
      field('Popis', popis),
      el('div.grid2', {}, field('Cena v goldoch', cena), field('Druh', druh)),
      el('label.row', {
        style: { gap: '10px', padding: '10px 12px', border: '1px solid var(--cream-line)', borderRadius: 'var(--r-md)', background: 'var(--white)', cursor: 'pointer' },
      }, viditelne, el('span.grow', { text: 'V ponuke' })),
      el('button.btn.btn--block', {
        text: novy ? 'Pridať do ponuky' : 'Uložiť',
        style: { marginTop: '8px' },
        onclick: () => {
          if (!name.value.trim()) { toast('Zadajte názov'); return; }
          upsertShopItem({
            id: item?.id,
            name: name.value.trim(),
            description: popis.value.trim(),
            price: Math.max(0, Number(cena.value) || 0),
            kind: druh.value,
            active: viditelne.checked,
          });
          close();
          toast(novy ? 'Odmena pridaná' : 'Uložené');
          refresh();
        },
      }),
    );
  });
}

function exportRebricek() {
  const t = rebricek({ zoradenie: uiState.zoradenie });
  const rows = [['Poradie', 'Hráč', 'Level', 'XP sezóna', 'XP celkovo', 'Podujatí', 'Tréningov',
    'Goldy zarobené', 'Goldy minuté', 'Zostatok']];
  for (const r of t) {
    rows.push([r.poradie, r.student.name, r.level, r.sezona.xp, r.celkovo.xp,
      r.sezona.podujatia, r.sezona.treningy, r.goldZarobene, r.goldMinute, r.gold]);
  }
  downloadCSV(`rebricek-${todayISO()}.csv`, rows);
  toast('CSV stiahnuté');
}
