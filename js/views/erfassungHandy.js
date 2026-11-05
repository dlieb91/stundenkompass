/* Erfassung am Handy – eine Zeile je Tag, ein Blatt zum Bearbeiten.

   Die Tabelle am PC ist rund 720 px breit; hochkant hat ein Handy 390 px.
   Statt sie seitlich wischen zu lassen, steht hier jeder Tag als eine
   kompakte Zeile mit allem, was man beim Durchsehen braucht: Zeiten, Ist,
   Saldo, Luecke oder Beanstandung. Ein Tipp oeffnet von unten ein Blatt
   mit grossen Feldern.

   Gerechnet wird wie ueberall in saldo.js; geschrieben wird ueber
   tagzugriff.js, genau wie aus der Tabelle. Die Ansicht ist also nur eine
   andere Anordnung derselben Daten.

   Im Blatt wird nach einer Eingabe nur der Ergebnisbereich nachgezogen,
   nicht das ganze Blatt. Sonst verschwaende beim Wechsel ins naechste Feld
   genau das Feld, das man gerade antippt – das „change" des alten kommt
   erst beim Verlassen. Neu gezeichnet wird nur bei Aenderungen am Aufbau:
   Tagesart, Abschnitt dazu oder weg, Vorgabe uebernehmen. */

import { el, leeren, datum, blatt } from '../util.js';
import { tabellenZeit, tabellenZahl, tabellenText, tabellenAuswahl } from '../felder.js';
import { state, aendern, tagLesen, vorgabeUebernehmen } from '../store.js';
import {
  WOCHENTAGE, WOCHENTAGE_LANG, wochentag, heuteISO,
} from '../kalender.js';
import { TAGESARTEN, tagesBilanz, wechselImMonat, wochenSollMinuten } from '../saldo.js';
import { stundenText, WARNTEXTE, pausenLuecken, zuMinuten } from '../zeit.js';
import { projektpflicht, projekteFuerAuswahl, projektMit } from '../stammdaten.js';
import {
  tagZugriff, intervallZugriff, abschnittAnhaengen, abschnittEntfernen, standardArt,
} from './tagzugriff.js';

const saldoKlasse = (min) => (min > 0 ? 'pos' : min < 0 ? 'neg' : 'dim');

/* ---------- Liste ---------- */

export function tagesListe(jahr, monat, bilanz, heute, neu) {
  const wechsel = wechselImMonat(jahr, monat, state.daten);
  const zeilen = [];
  for (const b of bilanz.tage) {
    const stichtag = wechsel.find((p) => p.gueltigAb === b.iso);
    if (stichtag) {
      zeilen.push(el('div.tl-wechsel', {
        text: `ab hier: ${stichtag.bezeichnung || 'neues Zeitmodell'} · ${stundenText(wochenSollMinuten(stichtag))} je Woche`,
      }));
    }
    zeilen.push(tagesZeile(b, heute, neu));
  }
  return el('div.card.tl', {}, [
    ...zeilen,
    el('div.tl-summe', {}, [
      el('span', { text: 'Summe' }),
      el('span', { text: `${stundenText(bilanz.istMin)} von ${stundenText(bilanz.sollMin)}` }),
      el('span.' + saldoKlasse(bilanz.saldoMin), { text: stundenText(bilanz.saldoMin, { vorzeichen: true }) }),
    ]),
  ]);
}

/** „08:00–12:00 · 12:30–läuft" */
function zeitenText(intervalle) {
  return intervalle
    .filter((iv) => iv && (iv.von || iv.bis))
    .map((iv) => `${iv.von || '?'}–${iv.bis || (zuMinuten(iv.von) != null ? 'läuft' : '?')}`)
    .join(' · ');
}

function tagesZeile(b, heute, neu) {
  const tag = tagLesen(b.iso);
  const intervalle = tag?.intervalle || [];
  const zeiten = zeitenText(intervalle);
  const pause = (tag?.pauseMin || 0) + pausenLuecken(intervalle);
  const projekte = [...new Set(intervalle.map((iv) => iv.projektId).filter(Boolean))]
    .map((id) => projektMit(id)?.code || projektMit(id)?.name).filter(Boolean);

  // Was in der Mitte steht: Zeiten, sonst die Tagesart, sonst „nicht erfasst".
  let mitte;
  if (zeiten) {
    mitte = el('span', { text: zeiten });
  } else if (b.art !== 'arbeit') {
    const text = b.art === 'feiertag' && b.feiertagName ? b.feiertagName : b.artInfo.text;
    mitte = b.art === 'frei' && !tag?.art
      ? el('span.faint', { text: 'frei' })
      : el('span.tl-chip.' + b.art, { text });
  } else if (b.luecke) {
    mitte = el('span.neg', { text: 'nicht erfasst' });
  } else {
    mitte = el('span.faint', { text: b.geplant ? '' : '–' });
  }

  const klein = [
    pause ? `Pause ${pause} min` : null,
    projekte.length ? projekte.join(', ') : null,
    tag?.notiz ? tag.notiz : null,
  ].filter(Boolean).join(' · ');

  // Urlaub, Krank & Co. gleichen das Soll genau aus – „0:00" waere nur Rauschen.
  const zeigtSaldo = b.zaehlt && (b.sollMin || b.istMin) && (b.istMin || b.saldoMin);
  const klassen = [
    b.iso === heute ? 'heute' : null,
    b.geplant ? 'geplant' : null,
    b.sollMin === 0 ? 'frei' : null,
  ].filter(Boolean);

  return el('button.tl-zeile' + (klassen.length ? '.' + klassen.join('.') : ''), {
    type: 'button',
    onclick: () => tagBlatt(b.iso, neu),
  }, [
    el('div.tl-datum', {}, [
      el('span', { text: WOCHENTAGE[wochentag(b.iso)] }),
      el('b', { text: b.iso.slice(8, 10) }),
    ]),
    el('div.tl-mitte', {}, [mitte, klein ? el('small', { text: klein }) : null]),
    el('div.tl-wert', {}, [
      b.warnungen.length ? el('span.badge.rot', { text: '!', title: b.warnungen.map((w) => WARNTEXTE[w]).join('\n') }) : null,
      el('div', {}, [
        el('span', { text: b.istMin ? stundenText(b.istMin).replace(' h', '') : '–' }),
        zeigtSaldo
          ? el('small.' + saldoKlasse(b.saldoMin), { text: stundenText(b.saldoMin, { vorzeichen: true }).replace(' h', '') })
          : null,
      ]),
    ]),
  ]);
}

/* ---------- Bearbeiten-Blatt ---------- */

async function tagBlatt(iso, neu) {
  const heute = heuteISO();
  const b0 = tagesBilanz(iso, state.daten, { heute });
  const sub = [
    b0.sollMin ? `Soll ${stundenText(b0.sollMin)}` : 'kein Soll',
    b0.plan?.bezeichnung || null,
    b0.feiertagName || null,
  ].filter(Boolean).join(' · ');

  await blatt({
    titel: `${WOCHENTAGE_LANG[wochentag(iso)]}, ${datum(iso)}`,
    sub,
    aufbauen: (body, neuZeichnen) => blattInhalt(body, iso, neuZeichnen),
  });
  neu();
}

function blattInhalt(body, iso, neuZeichnen) {
  const heute = heuteISO();
  const bilanz = () => tagesBilanz(iso, state.daten, { heute, projektpflicht: projektpflicht() });
  const b = bilanz();
  const zugriff = tagZugriff(iso, standardArt(b));
  const mitProjekt = projektpflicht();
  const tag = tagLesen(iso);
  const intervalle = tag?.intervalle?.length ? tag.intervalle : [{ von: '', bis: '' }];
  const hatZeiten = intervalle.some((iv) => iv.von || iv.bis);

  /* Tagesart */
  const artKnoepfe = TAGESARTEN.map((a) => el('button.blatt-wahl', {
    type: 'button',
    dataset: { wert: a.wert },
    onclick: () => { aendern(() => { zugriff.art = a.wert; }); neuZeichnen(); },
  }, [a.text === 'Halber Urlaubstag' ? '½ Urlaub' : a.text === 'Freizeitausgleich' ? 'Ausgleich' : a.text]));
  const artMarkieren = () => {
    for (const k of artKnoepfe) k.classList.toggle('an', k.dataset.wert === zugriff.art);
  };

  /* Ergebnis – wird nach jeder Eingabe nachgezogen */
  const ergebnisBox = el('div.blatt-ergebnis');
  const ergebnis = () => {
    const x = bilanz();
    const t = tagLesen(iso);
    const luecken = pausenLuecken(t?.intervalle || []);
    leeren(ergebnisBox);
    ergebnisBox.append(
      el('div', {}, [
        el('span', { text: `Pause ${(t?.pauseMin || 0) + luecken} min${luecken ? ` (davon ${luecken} Lücke)` : ''}` }),
        el('span', {}, [
          'Ist ', el('b', { text: stundenText(x.istMin) }),
          x.zaehlt && (x.sollMin || x.istMin)
            ? el('span.' + saldoKlasse(x.saldoMin), { text: ' · ' + stundenText(x.saldoMin, { vorzeichen: true }) })
            : null,
        ]),
      ]),
      ...x.warnungen.map((w) => el('div.neg', { text: WARNTEXTE[w] })),
    );
    artMarkieren();
  };

  /* Abschnitte */
  const abschnitte = intervalle.map((iv, i) => {
    const z = intervallZugriff(iso, i);
    const leer = !iv.von && !iv.bis;
    const entfernen = intervalle.length > 1 || !leer
      ? el('button.icon-mini', {
        type: 'button', title: 'Abschnitt entfernen',
        onclick: () => {
          if (intervalle.length > 1) abschnittEntfernen(iso, i);
          else aendern(() => { z.von = ''; z.bis = ''; });
          neuZeichnen();
        },
      }, ['×'])
      : el('span');
    return el('div.blatt-abschnitt', {}, [
      el('div.blatt-zeiten', {}, [
        tabellenZeit(z, 'von', { nach: ergebnis, title: 'Von' }),
        el('span.faint', { text: '–' }),
        tabellenZeit(z, 'bis', { nach: ergebnis, title: 'Bis' }),
        entfernen,
      ]),
      mitProjekt
        ? tabellenAuswahl(z, 'projektId', [{ wert: '', text: '– kein Projekt –' }, ...projekteFuerAuswahl()], { nach: ergebnis })
        : null,
    ]);
  });

  body.append(
    el('div.blatt-wahlen', {}, artKnoepfe),
    el('div.blatt-feldname', { text: 'Arbeitszeit' }),
    ...abschnitte,
    el('div.blatt-reihe', {}, [
      el('button.btn', { type: 'button', onclick: () => { abschnittAnhaengen(iso); neuZeichnen(); } }, ['+ weiteren Abschnitt']),
      !hatZeiten && b.plan && b.sollMin > 0
        ? el('button.btn', {
          type: 'button',
          onclick: () => { aendern(() => { vorgabeUebernehmen(iso, b.plan); }); neuZeichnen(); },
        }, ['Vorgabe übernehmen'])
        : null,
    ]),
    el('div.blatt-feldname', { text: 'Zusätzliche Pause in Minuten' }),
    el('div.blatt-klein', { text: 'Nur, wenn die Pause nicht schon als Lücke zwischen zwei Abschnitten steht.' }),
    tabellenZahl(zugriff, 'pauseMin', { nachkomma: 0, platzhalter: '0', nach: ergebnis, style: 'text-align:left' }),
    el('div.blatt-feldname', { text: 'Notiz' }),
    tabellenText(zugriff, 'notiz', { platzhalter: b.feiertagName || '', nach: ergebnis }),
    ergebnisBox,
  );
  ergebnis();
}
