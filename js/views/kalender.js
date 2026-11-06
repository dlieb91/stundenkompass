/* Kalender – wann gearbeitet wurde, als Zeitachse.

   Woche (Mo–So) oder ein einzelner Tag, Stunden von oben nach unten, jeder
   Abschnitt ein farbiger Block: Arbeit, Krank, Urlaub. Krank und Urlaub
   ohne eigene Zeiten stehen mit den Vorgabezeiten des Zeitmodells da, die
   Vorgabepause als eigener Block (siehe kalenderTermine.js). Feiertage,
   freie Tage und Arbeitstage ohne Eintrag stehen in der Ganztagszeile oben.

   Ein Klick auf einen Tag oeffnet dasselbe Bearbeiten-Blatt wie die
   Erfassung am Handy – der Kalender ist also auch ein Weg zum Nachtragen.

   Am Handy gibt es nur die Tagessicht: sieben Spalten auf 390 px waeren
   je 45 px breit, darin passt keine Uhrzeit. Welche Sicht und welcher Tag
   gewaehlt sind, steht im localStorage, nicht in der Datei. */

import { el, leeren } from '../util.js';
import { monatsTage, monatPlus, monatsBezeichnung } from '../kalender.js';
import { state } from '../store.js';
import {
  heuteISO, tagePlus, wochentag, kwNummer, MONATSNAMEN, WOCHENTAGE, WOCHENTAGE_LANG,
} from '../kalender.js';
import { zuUhrzeit, stundenText } from '../zeit.js';
import { projektMit } from '../stammdaten.js';
import { artMit } from '../saldo.js';
import { handyAnsicht } from '../ansicht.js';
import { tagesTermine, stundenBereich } from '../kalenderTermine.js';
import { tagBlatt } from './erfassungHandy.js';

const SCHLUESSEL = 'stundenkompass-kalender';

/* Zustand des Minikalenders: welcher Monat gezeigt wird und ob er am Handy
   aufgeklappt ist. Nur fuer diese Sitzung, nicht im localStorage. */
const mini = { folgt: null, jahr: 0, monat: 0, offen: false };
const STUNDE_PX = 48;

const ART_TEXT = { arbeit: 'Arbeit', krank: 'Krank', urlaub: 'Urlaub', pause: 'Pause' };

function sichtLesen() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SCHLUESSEL) || '{}'); } catch { /* egal */ }
  return {
    modus: s.modus === 'tag' ? 'tag' : 'woche',
    tag: /^\d{4}-\d{2}-\d{2}$/.test(s.tag || '') ? s.tag : heuteISO(),
  };
}

function sichtSchreiben(s) {
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(s)); } catch { /* privates Fenster */ }
}

const montagVon = (iso) => tagePlus(iso, -wochentag(iso));
const tagZahl = (iso) => Number(iso.slice(8, 10));
const monatName = (iso) => MONATSNAMEN[Number(iso.slice(5, 7)) - 1];
const jetztMinuten = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

function titelText(modus, tage) {
  const a = tage[0];
  if (modus === 'tag') return `${WOCHENTAGE_LANG[wochentag(a)]}, ${tagZahl(a)}. ${monatName(a)} ${a.slice(0, 4)}`;
  const e = tage[tage.length - 1];
  const links = a.slice(5, 7) === e.slice(5, 7) ? `${tagZahl(a)}.` : `${tagZahl(a)}. ${monatName(a)}${a.slice(0, 4) === e.slice(0, 4) ? '' : ' ' + a.slice(0, 4)}`;
  return `${links} – ${tagZahl(e)}. ${monatName(e)} ${e.slice(0, 4)}`;
}

export const kalender = {
  render(container) {
    const neu = () => { leeren(container); this.render(container); };
    const sicht = sichtLesen();
    const handy = handyAnsicht();
    const modus = handy ? 'tag' : sicht.modus;
    const heute = heuteISO();
    const jetztMin = jetztMinuten();

    const start = modus === 'woche' ? montagVon(sicht.tag) : sicht.tag;
    const tage = Array.from({ length: modus === 'woche' ? 7 : 1 }, (_, i) => tagePlus(start, i));
    const termine = tage.map((iso) => tagesTermine(iso, state.daten, { heute, jetztMin }));

    const setzen = (aenderung) => { sichtSchreiben({ ...sicht, ...aenderung }); neu(); };
    const schritt = modus === 'woche' ? 7 : 1;

    // Der Minikalender folgt dem gewaehlten Tag, solange man nicht in ihm
    // selbst blaettert.
    if (mini.folgt !== sicht.tag) {
      mini.folgt = sicht.tag;
      mini.jahr = Number(sicht.tag.slice(0, 4));
      mini.monat = Number(sicht.tag.slice(5, 7));
    }

    const aussen = el('div.view-inner.kal-layout' + (handy ? '' : '.mit-mini'));
    const inner = el('div.kal-haupt', { style: 'display:grid;gap:12px;min-width:0' });
    const miniBereich = (!handy || mini.offen)
      ? minikalender({ sicht, modus, heute, waehlen: (iso) => { mini.offen = false; setzen({ modus: 'tag', tag: iso }); }, neu })
      : null;
    aussen.append(...(handy ? [] : [miniBereich]), inner);
    container.append(aussen);

    inner.append(el('div.card', {}, [el('div.card-head.kal-kopf', {}, [
      el('div.kal-nav', {}, [
        el('button.btn.btn-sm', { type: 'button', title: modus === 'woche' ? 'Vorherige Woche' : 'Vorheriger Tag', onclick: () => setzen({ tag: tagePlus(sicht.tag, -schritt) }) }, ['◀']),
        el('button.btn.btn-sm', { type: 'button', title: modus === 'woche' ? 'Nächste Woche' : 'Nächster Tag', onclick: () => setzen({ tag: tagePlus(sicht.tag, schritt) }) }, ['▶']),
        el('button.btn.btn-sm.kal-heute-knopf', { type: 'button', title: 'Zum heutigen Tag', onclick: () => setzen({ tag: heute }) }, ['Heute']),
        handy ? el('button.btn.btn-sm.kal-mini-knopf' + (mini.offen ? '.an' : ''), {
          type: 'button', title: 'Tag im Monatskalender wählen', 'aria-expanded': String(!!mini.offen),
          html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2"/></svg>',
          onclick: () => { mini.offen = !mini.offen; neu(); },
        }) : null,
        el('div.kal-titel', {}, [
          el('h2', { text: titelText(modus, tage) }),
          el('div.sub', { text: modus === 'woche' ? `KW ${kwNummer(start)}` : tagText(termine[0]) }),
        ]),
      ]),
      el('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap' }, [
        legende(),
        handy ? null : el('div.seg.seg-sm', {}, [
          el('button' + (modus === 'woche' ? '.aktiv' : ''), { type: 'button', onclick: () => setzen({ modus: 'woche' }) }, ['Woche']),
          el('button' + (modus === 'tag' ? '.aktiv' : ''), { type: 'button', onclick: () => setzen({ modus: 'tag' }) }, ['Tag']),
        ]),
      ]),
    ])]));

    if (handy && miniBereich) inner.append(miniBereich);

    const karte = raster(modus, termine, heute, jetztMin, neu, (iso) => setzen({ modus: 'tag', tag: iso }));
    wischen(karte, (richtung) => setzen({ tag: tagePlus(sicht.tag, richtung * schritt) }));
    inner.append(karte);

    if (modus === 'woche') {
      inner.append(el('div.faint', { style: 'font-size:12px', text: `${wochenSumme(termine)} · Ein Klick auf einen Tag öffnet ihn zum Bearbeiten, ein Klick auf das Datum zeigt den Tag allein.` }));
    } else {
      inner.append(el('div.faint', { style: 'font-size:12px', text: (handy ? 'Antippen zum Bearbeiten, seitlich wischen für den nächsten Tag. ' : 'Klicken zum Bearbeiten. ') + 'Krank und Urlaub stehen mit den Vorgabezeiten des Zeitmodells da.' }));
    }

    // Ein laufender Abschnitt waechst mit der Uhr – einmal je Minute nachziehen.
    if (termine.some((t) => t.bloecke.some((b) => b.laeuft)) || tage.includes(heute)) {
      setTimeout(() => { if (inner.isConnected && !document.querySelector('.blatt-hintergrund')) neu(); }, 60000);
    }
  },
};

function wochenSumme(termine) {
  const ist = termine.reduce((s, t) => s + t.istMin, 0);
  return ist ? `${stundenText(ist)} gearbeitet` : 'nichts gearbeitet';
}

/** Untertitel der Tagessicht: was an dem Tag war. */
function tagText(t) {
  const art = t.art === 'feiertag' ? (t.feiertagName || 'Feiertag')
    : ['krank', 'urlaub', 'urlaubHalb', 'ausgleich'].includes(t.art) ? artMit(t.art).text : '';
  if (t.istMin) return [`${stundenText(t.istMin)} gearbeitet`, art].filter(Boolean).join(' · ');
  return art || (t.art === 'frei' ? 'frei' : 'nichts erfasst');
}

/* Am Handy: seitlich wischen blaettert. Nur deutlich waagrechte Bewegungen,
   damit senkrechtes Scrollen durch die Stunden nicht blaettert. */
function wischen(ziel, blaettern) {
  let x0 = null;
  let y0 = null;
  ziel.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  ziel.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) blaettern(dx < 0 ? 1 : -1);
  }, { passive: true });
}

function legende() {
  return el('div.kal-legende', {}, ['arbeit', 'krank', 'urlaub'].map((a) => el('span', {}, [
    el('i.kal-farbe.kal-' + a), ART_TEXT[a],
  ])));
}

function raster(modus, termine, heute, jetztMin, neu, tagZeigen) {
  const { vonStunde, bisStunde } = stundenBereich(termine);
  const hoehe = (bisStunde - vonStunde) * STUNDE_PX;
  const y = (min) => ((min - vonStunde * 60) / 60) * STUNDE_PX;
  const spalten = `52px repeat(${termine.length}, minmax(0, 1fr))`;
  const bearbeiten = (iso) => tagBlatt(iso, neu);

  const kopf = el('div.kal-zeile.kal-tagkopf', { style: `grid-template-columns:${spalten}` }, [
    el('div'),
    ...termine.map((t) => el('button.kal-datum' + (t.iso === heute ? '.heute' : ''), {
      type: 'button',
      title: modus === 'woche' ? 'Diesen Tag allein zeigen' : 'Bearbeiten',
      onclick: () => (modus === 'woche' ? tagZeigen(t.iso) : bearbeiten(t.iso)),
    }, [
      el('span.kal-wt', { text: WOCHENTAGE[wochentag(t.iso)].toUpperCase() }),
      el('span.kal-nr', { text: String(tagZahl(t.iso)) }),
      el('span.kal-ist', { text: t.istMin ? stundenText(t.istMin) : '' }),
    ])),
  ]);

  const ganztags = el('div.kal-zeile.kal-ganztags', { style: `grid-template-columns:${spalten}` }, [
    el('div.kal-gmt'),
    ...termine.map((t) => el('div.kal-ganztags-zelle', { onclick: () => bearbeiten(t.iso) },
      t.ganztags.map((g) => el('div.kal-chip.kal-' + g.art, { text: g.text })))),
  ]);

  const achse = el('div.kal-achse', { style: `height:${hoehe}px` });
  for (let h = vonStunde; h < bisStunde; h++) {
    achse.append(el('div.kal-uhr', { style: `top:${y(h * 60)}px`, text: `${String(h).padStart(2, '0')}:00` }));
  }

  const koerper = el('div.kal-zeile.kal-koerper', { style: `grid-template-columns:${spalten}` }, [
    achse,
    ...termine.map((t) => {
      const spalte = el('div.kal-spalte' + (t.iso === heute ? '.heute' : ''), {
        style: `height:${hoehe}px;background-size:100% ${STUNDE_PX}px`,
        onclick: () => bearbeiten(t.iso),
      });
      for (const b of t.bloecke) spalte.append(block(b, y, modus));
      if (t.iso === heute && jetztMin >= vonStunde * 60 && jetztMin <= bisStunde * 60) {
        spalte.append(el('div.kal-jetzt', { style: `top:${y(jetztMin)}px` }));
      }
      return spalte;
    }),
  ]);

  // In der Tagessicht steht das Datum schon im Titel darueber.
  return el('div.card.kal' + (modus === 'tag' ? '.kal-tagsicht' : ''), {}, [modus === 'woche' ? kopf : null, ganztags, koerper]);
}

function block(b, y, modus) {
  const top = y(b.von);
  const hoehe = Math.max(14, y(b.bis) - top - 2);
  const breite = 100 / (b.spuren || 1);
  const projekt = b.projektId ? projektMit(b.projektId) : null;
  const titel = b.art === 'arbeit'
    ? (projekt ? [projekt.code, projekt.name].filter(Boolean).join(' ') : 'Arbeit')
    : b.halb ? '½ Urlaub' : ART_TEXT[b.art];
  // In der Woche sind die Spalten schmal – dort der Strich statt „bis".
  const zeit = `${zuUhrzeit(b.von)}${modus === 'woche' ? '–' : ' bis '}${b.laeuft ? 'jetzt' : zuUhrzeit(b.bis === 1440 ? 0 : b.bis)}`;
  const kurz = hoehe < 34;
  const zusatz = b.laeuft ? 'läuft' : b.vorgabe && b.art !== 'pause' ? 'Vorgabezeit' : b.vomVortag ? 'vom Vortag' : '';

  return el('div.kal-block.kal-' + b.art + (b.laeuft ? '.laeuft' : '') + (kurz ? '.kurz' : ''), {
    style: `top:${top + 1}px;height:${hoehe}px;left:calc(${b.spur * breite}% + 2px);width:calc(${breite}% - 5px)`,
    title: `${titel}\n${zeit}${zusatz ? '\n' + zusatz : ''}`,
  }, kurz
    ? [el('div.kal-btitel', { text: `${titel} · ${zeit}` })]
    : [
      el('div.kal-btitel', { text: titel }),
      el('div.kal-bzeit', { text: zeit }),
      zusatz && (modus === 'tag' || hoehe > 60) ? el('div.kal-bzusatz', { text: zusatz }) : null,
    ]);
}

/* ---------- Minikalender ----------
   Ein Monat zum Anklicken: der gewaehlte Tag erscheint gross in der
   Tagessicht. Punkte zeigen, was an einem Tag war (Arbeit, Krank, Urlaub),
   heute ist ausgefuellt, der gezeigte Tag bzw. die gezeigte Woche hinterlegt. */
function minikalender({ sicht, modus, heute, waehlen, neu }) {
  const { jahr, monat } = mini;
  const tage = monatsTage(jahr, monat);
  const erster = montagVon(tage[0]);
  const letzter = tagePlus(montagVon(tage[tage.length - 1]), 6);
  const wocheVon = montagVon(sicht.tag);
  const blaettern = (n) => { const m = monatPlus(jahr, monat, n); mini.jahr = m.jahr; mini.monat = m.monat; neu(); };

  const zellen = [];
  for (let iso = erster; iso <= letzter; iso = tagePlus(iso, 1)) {
    const imMonat = iso.slice(0, 7) === tage[0].slice(0, 7);
    const gewaehlt = modus === 'tag' ? iso === sicht.tag : montagVon(iso) === wocheVon;
    const t = imMonat ? tagesTermine(iso, state.daten, { heute }) : null;
    const punkt = !t ? null
      : t.art === 'krank' ? 'krank'
        : (t.art === 'urlaub' || t.art === 'urlaubHalb') ? 'urlaub'
          : t.istMin > 0 ? 'arbeit' : null;
    zellen.push(el('button.mini-tag'
      + (imMonat ? '' : '.fremd') + (iso === heute ? '.heute' : '') + (gewaehlt ? '.gewaehlt' : '')
      + (modus === 'woche' && gewaehlt ? '.woche' : ''), {
      type: 'button', title: datumLang(iso), onclick: () => waehlen(iso),
    }, [
      el('span', { text: String(tagZahl(iso)) }),
      punkt ? el('i.mini-punkt.kal-' + punkt) : null,
    ]));
  }

  return el('div.card.kal-mini', {}, [
    el('div.mini-kopf', {}, [
      el('button.btn.btn-sm.btn-ghost', { type: 'button', title: 'Vorheriger Monat', onclick: () => blaettern(-1) }, ['‹']),
      el('b', { text: monatsBezeichnung(jahr, monat) }),
      el('button.btn.btn-sm.btn-ghost', { type: 'button', title: 'Nächster Monat', onclick: () => blaettern(1) }, ['›']),
    ]),
    el('div.mini-raster', {}, [
      ...WOCHENTAGE.map((w) => el('div.mini-wt', { text: w.slice(0, 2) })),
      ...zellen,
    ]),
  ]);
}

const datumLang = (iso) => `${WOCHENTAGE_LANG[wochentag(iso)]}, ${tagZahl(iso)}. ${monatName(iso)} ${iso.slice(0, 4)}`;
