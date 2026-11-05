/* Erfassung – zugleich die Monatsuebersicht.

   Gezeigt wird *jeder* Tag des Monats, nicht nur die erfassten. Nur so sieht
   man die Luecken, und nur so kann man einen Tag nachtragen, ohne ihn vorher
   anlegen zu muessen.

   Die Eingabefelder schreiben ueber die Zugriffsobjekte aus tagzugriff.js –
   ein nur angeklickter Tag hinterlaesst so keinen leeren Eintrag.

   Am Handy steht statt der Tabelle eine Tagesliste (erfassungHandy.js);
   Kopf, Summen, Luecken fuellen und Urlaub planen sind dieselben.
*/

import { el, leeren, num, datum, modal, bestaetigen, toast } from '../util.js';
import { tabellenZeit, tabellenZahl, tabellenText, tabellenAuswahl, hinweis } from '../felder.js';
import { state, aendern, tagHolen, tagLesen, vorgabeUebernehmen } from '../store.js';
import {
  tagZugriff, intervallZugriff, abschnittAnhaengen, abschnittEntfernen, standardArt,
} from './tagzugriff.js';
import { tagesListe } from './erfassungHandy.js';
import { handyAnsicht } from '../ansicht.js';
import {
  WOCHENTAGE, heuteISO, monatsBezeichnung, kwNummer, istWochenende, wochentag,
} from '../kalender.js';
import {
  TAGESARTEN, monatsBilanz, tagesBilanz, wochenplanFuer, wechselImMonat, wochenSollMinuten,
} from '../saldo.js';
import { stundenText, WARNTEXTE } from '../zeit.js';
import { gewaehlterMonat, setMonat, monatVerschieben } from '../ansicht.js';
import { projektpflicht, projekteFuerAuswahl } from '../stammdaten.js';

export const erfassung = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    const neu = () => { leeren(container); this.render(container); };

    const { jahr, monat } = gewaehlterMonat();
    const heute = heuteISO();
    const bilanz = monatsBilanz(jahr, monat, state.daten, { heute, projektpflicht: projektpflicht() });

    inner.append(werkzeugleiste(jahr, monat, bilanz, neu));
    inner.append(summenLeiste(bilanz));
    // Am Handy eine Zeile je Tag mit Bearbeiten-Blatt – die Tabelle ist dort
    // mehr als doppelt so breit wie der Bildschirm (siehe erfassungHandy.js).
    inner.append(handyAnsicht()
      ? tagesListe(jahr, monat, bilanz, heute, neu)
      : tagesTabelle(jahr, monat, bilanz, heute, neu));
  },
};

/* ---------- Kopf ---------- */

function werkzeugleiste(jahr, monat, bilanz, neu) {
  const springen = (n) => { monatVerschieben(n); neu(); };

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', { style: 'display:flex;align-items:center;gap:10px' }, [
        el('button.btn.btn-sm', { type: 'button', title: 'Vorheriger Monat', onclick: () => springen(-1) }, ['◀']),
        el('div', {}, [
          el('h2', { text: monatsBezeichnung(jahr, monat) }),
          el('div.sub', { text: `${bilanz.tage.filter((t) => t.sollMin > 0).length} Arbeitstage im Monat` }),
        ]),
        el('button.btn.btn-sm', { type: 'button', title: 'Nächster Monat', onclick: () => springen(1) }, ['▶']),
        el('button.btn.btn-sm.btn-ghost', {
          type: 'button',
          onclick: () => {
            const h = heuteISO();
            setMonat(Number(h.slice(0, 4)), Number(h.slice(5, 7)));
            neu();
          },
        }, ['Heute']),
      ]),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
        bilanz.luecken
          ? el('button.btn.btn-sm', {
            type: 'button',
            onclick: () => lueckenFuellen(jahr, monat, neu),
          }, [`${bilanz.luecken} Lücke${bilanz.luecken === 1 ? '' : 'n'} mit Vorgabe füllen`])
          : null,
        el('button.btn.btn-sm.btn-primary', {
          type: 'button', onclick: () => urlaubPlanen(jahr, monat, neu),
        }, ['Urlaub planen …']),
      ]),
    ]),
  ]);
}

async function lueckenFuellen(jahr, monat, neu) {
  const heute = heuteISO();
  const offen = monatsBilanz(jahr, monat, state.daten, { heute }).tage.filter((t) => t.luecke);
  if (!offen.length) return;

  const ja = await bestaetigen(
    'Lücken mit der Vorgabe füllen',
    `${offen.length} Arbeitstag${offen.length === 1 ? '' : 'e'} ohne Eintrag ${offen.length === 1 ? 'wird' : 'werden'} `
    + 'mit den Vorgabezeiten des jeweils gültigen Zeitmodells gefüllt. Bereits erfasste Tage bleiben unberührt.',
    { okText: 'Füllen' }
  );
  if (!ja) return;

  aendern(() => {
    for (const t of offen) vorgabeUebernehmen(t.iso, wochenplanFuer(t.iso, state.daten));
  });
  toast(`${offen.length} Tage gefüllt`, 'ok');
  neu();
}

async function urlaubPlanen(jahr, monat, neu) {
  const erster = `${jahr}-${String(monat).padStart(2, '0')}-01`;
  const vonInput = el('input', { type: 'date', value: erster });
  const bisInput = el('input', { type: 'date', value: erster });
  const vorschau = el('div.note', { style: 'margin:14px 0 0' });

  const betroffene = () => {
    const von = vonInput.value;
    const bis = bisInput.value;
    if (!von || !bis || bis < von) return [];
    const treffer = [];
    // Tag fuer Tag, damit Wochenenden und Feiertage von selbst herausfallen –
    // sie haben kein Soll und kosten deshalb keinen Urlaubstag.
    for (let iso = von; iso <= bis; iso = naechsterTag(iso)) {
      const b = tagesBilanz(iso, state.daten);
      if (b.arbeitspflicht) treffer.push(iso);
    }
    return treffer;
  };

  const vorschauSetzen = () => {
    const liste = betroffene();
    leeren(vorschau);
    vorschau.append(el('div', {
      text: liste.length
        ? `${liste.length} Arbeitstag${liste.length === 1 ? '' : 'e'} werden als Urlaub eingetragen. `
          + 'Wochenenden und Feiertage bleiben ausgenommen.'
        : 'In diesem Zeitraum liegt kein Arbeitstag.',
    }));
  };
  vonInput.addEventListener('change', vorschauSetzen);
  bisInput.addEventListener('change', vorschauSetzen);
  vorschauSetzen();

  const inhalt = el('div', {}, [
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:0 18px' }, [
      el('div.field', {}, [el('label', { text: 'Von' }), vonInput]),
      el('div.field', {}, [el('label', { text: 'Bis' }), bisInput]),
    ]),
    vorschau,
  ]);

  const ok = await modal({
    titel: 'Urlaub planen',
    beschreibung: 'Der Zeitraum wird als Urlaub eingetragen. Geplante Tage in der Zukunft belasten sofort '
      + 'das Urlaubsbudget, erzeugen aber keine Minusstunden.',
    inhalt,
    buttons: [{ text: 'Abbrechen', wert: false }, { text: 'Eintragen', wert: true, klasse: 'btn-primary' }],
  });
  if (!ok) return;

  const liste = betroffene();
  if (!liste.length) { toast('Kein Arbeitstag im Zeitraum', 'info'); return; }
  aendern(() => {
    for (const iso of liste) tagHolen(iso).art = 'urlaub';
  });
  toast(`${liste.length} Urlaubstage eingetragen`, 'ok');
  neu();
}

function naechsterTag(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/* ---------- Summen ---------- */

function summenLeiste(b) {
  const kasten = (label, wert, sub, klasse) => el('div.summe', {}, [
    el('div.summe-label', { text: label }),
    el('div.summe-wert' + (klasse ? '.' + klasse : ''), { text: wert }),
    el('div.summe-sub', { text: sub || '' }),
  ]);

  return el('div.summen', { style: 'margin-top:0' }, [
    kasten('Soll', stundenText(b.sollMin), 'im Monat'),
    kasten('Ist', stundenText(b.istMin), 'erfasste Arbeitszeit'),
    kasten('Saldo', stundenText(b.saldoMin, { vorzeichen: true }), 'bis heute',
      b.saldoMin > 0 ? 'pos' : b.saldoMin < 0 ? 'neg' : ''),
    kasten('Urlaub', num(b.urlaubTage + b.urlaubGeplant, 1) + ' T',
      b.urlaubGeplant ? `davon ${num(b.urlaubGeplant, 1)} geplant` : 'genommen'),
    kasten('Lücken', String(b.luecken), b.luecken ? 'Arbeitstage ohne Eintrag' : 'alles erfasst',
      b.luecken ? 'neg' : ''),
  ]);
}

/* ---------- Tabelle ---------- */

/** Spalten der Tabelle. Projekt erscheint nur bei eingeschalteter
    Projektpflicht – ein Betrieb ohne Projekte merkt sonst nichts davon. */
function spalten(mitProjekt) {
  return [
    ['KW', 'width:38px'],
    ['Datum', 'width:96px'],
    ['Tag', 'width:44px'],
    ['Art', 'width:130px'],
    ['Von', 'width:104px'],
    ['Bis', 'width:132px'],
    ...(mitProjekt ? [['Projekt', 'width:170px']] : []),
    ['Pause', 'width:74px;text-align:right'],
    ['Ist', 'text-align:right'],
    ['Soll', 'text-align:right'],
    ['Saldo', 'text-align:right'],
    ['', 'width:34px'],
    ['Notiz', ''],
  ];
}

function tagesTabelle(jahr, monat, bilanz, heute, neu) {
  const mitProjekt = projektpflicht();
  const wechsel = wechselImMonat(jahr, monat, state.daten);
  const koerper = el('tbody');

  for (const b of bilanz.tage) {
    const stichtag = wechsel.find((p) => p.gueltigAb === b.iso);
    if (stichtag) koerper.append(wechselZeile(stichtag, mitProjekt));
    koerper.append(tagesZeile(b, heute, neu, mitProjekt));
  }

  const spaltenListe = spalten(mitProjekt);
  // KW..Bis[..Projekt]..Pause vor der Summenspalte Ist – ohne Projektspalte 7, mit 8.
  const vorSpalten = mitProjekt ? 8 : 7;

  return el('div.card', {}, [
    el('div.card-body', {}, [
      hinweis('Mehrere Abschnitte am Tag: mit <strong>+</strong> eine weitere Zeile anhängen. '
        + 'Die Lücke zwischen zwei Abschnitten ist bereits die Pause – das Pausenfeld bleibt dann leer. '
        + 'Wer <strong>einen</strong> Abschnitt von Beginn bis Ende einträgt, schreibt die Pause ins Pausenfeld.'
        + (mitProjekt ? ' Jeder Abschnitt bekommt sein eigenes Projekt.' : '')),
      el('div.plan-scroll', {}, [
        el('table.data.kompakt.erfassung', {}, [
          el('thead', {}, [el('tr', {}, spaltenListe.map(([titel, stil]) => el('th', { text: titel, style: stil })))]),
          koerper,
          el('tfoot', {}, [el('tr', {}, [
            el('td', { text: 'Summe', colspan: vorSpalten, style: 'font-weight:600' }),
            el('td.num', { text: stundenText(bilanz.istMin), style: 'font-weight:600' }),
            el('td.num', { text: stundenText(bilanz.sollMin), style: 'font-weight:600' }),
            el('td.num' + saldoKlasse(bilanz.saldoMin), { text: stundenText(bilanz.saldoMin, { vorzeichen: true }), style: 'font-weight:600' }),
            el('td', { colspan: 2 }),
          ])]),
        ]),
      ]),
    ]),
  ]);
}

const saldoKlasse = (min) => (min > 0 ? '.pos' : min < 0 ? '.neg' : '.dim');

function wechselZeile(plan, mitProjekt) {
  return el('tr.wechsel-zeile', {}, [
    el('td', { colspan: spalten(mitProjekt).length }, [
      el('span', { text: `ab hier: ${plan.bezeichnung || 'neues Zeitmodell'} · ${stundenText(wochenSollMinuten(plan))} je Woche` }),
    ]),
  ]);
}

function tagesZeile(b, heute, neu, mitProjekt) {
  const iso = b.iso;
  const zugriff = tagZugriff(iso, standardArt(b));
  const tag = tagLesen(iso);
  const intervalle = tag?.intervalle?.length ? tag.intervalle : [{ von: '', bis: '' }];

  const klassen = [
    iso === heute ? 'zeile-aktiv' : null,
    b.geplant ? 'zeile-geplant' : null,
    b.sollMin === 0 ? 'tag-frei' : null,
  ].filter(Boolean);

  const vonZellen = intervalle.map((_, i) => tabellenZeit(intervallZugriff(iso, i), 'von', { umbauen: neu }));
  const bisZellen = intervalle.map((_, i) => el('div', { style: 'display:flex;gap:3px;align-items:center' }, [
    tabellenZeit(intervallZugriff(iso, i), 'bis', { umbauen: neu }),
    i > 0
      ? el('button.icon-mini', {
        type: 'button', title: 'Abschnitt entfernen',
        onclick: () => {
          abschnittEntfernen(iso, i);
          neu();
        },
      }, ['×'])
      : el('button.icon-mini.neutral', {
        type: 'button', title: 'Weiteren Abschnitt anhängen',
        onclick: () => {
          abschnittAnhaengen(iso);
          neu();
        },
      }, ['+']),
  ]));

  const projektZellen = mitProjekt
    ? intervalle.map((_, i) => tabellenAuswahl(
      intervallZugriff(iso, i), 'projektId',
      [{ wert: '', text: '– kein Projekt –' }, ...projekteFuerAuswahl()],
      { nach: neu },
    ))
    : null;

  return el('tr' + (klassen.length ? '.' + klassen.join('.') : ''), {}, [
    el('td.faint.num', { text: String(kwNummer(iso)) }),
    el('td', { text: datum(iso) }),
    el('td' + (istWochenende(iso) ? '.faint' : ''), { text: WOCHENTAGE[wochentag(iso)] }),
    el('td', {}, [tabellenAuswahl(zugriff, 'art',
      TAGESARTEN.map((a) => ({ wert: a.wert, text: a.text })),
      { nach: neu, title: b.feiertagName || '' })]),
    el('td', {}, [el('div', { style: 'display:grid;gap:3px' }, vonZellen)]),
    el('td', {}, [el('div', { style: 'display:grid;gap:3px' }, bisZellen)]),
    mitProjekt ? el('td', {}, [el('div', { style: 'display:grid;gap:3px' }, projektZellen)]) : null,
    el('td', {}, [tabellenZahl(zugriff, 'pauseMin', { nachkomma: 0, platzhalter: '0', umbauen: neu })]),
    el('td.num', { text: b.istMin ? stundenText(b.istMin) : '–' }),
    el('td.num.faint', { text: b.sollMin ? stundenText(b.sollMin) : '–' }),
    el('td.num' + (b.zaehlt ? saldoKlasse(b.saldoMin) : '.faint'), {
      // Ein freier Tag ohne Arbeit hat kein Saldo, nur eine Null – die waere
      // in einer Spalte voller Zahlen nichts als Rauschen.
      text: b.zaehlt && (b.sollMin || b.istMin) ? stundenText(b.saldoMin, { vorzeichen: true }) : '–',
      title: b.geplant ? 'Liegt in der Zukunft und zählt noch nicht' : b.zaehlt ? '' : 'Liegt vor dem Erfassungsbeginn',
    }),
    el('td', {}, [hinweisZelle(b, neu)]),
    el('td', {}, [tabellenText(zugriff, 'notiz', { platzhalter: b.feiertagName || '', umbauen: neu })]),
  ]);
}

/**
 * Die schmale Spalte am Ende: entweder eine Beanstandung oder – bei einem
 * leeren Arbeitstag – der Knopf, der die Vorgabezeiten einsetzt. Beides
 * zugleich kommt nicht vor, ein leerer Tag hat nichts zu beanstanden.
 */
function hinweisZelle(b, neu) {
  if (b.warnungen.length) {
    return el('span.badge.rot', {
      text: '!', title: b.warnungen.map((w) => WARNTEXTE[w]).join('\n'),
    });
  }
  if (b.luecke || (b.art === 'arbeit' && b.sollMin > 0 && !b.istMin)) {
    return el('button.icon-mini.neutral', {
      type: 'button', title: 'Vorgabezeiten übernehmen',
      onclick: () => {
        aendern(() => { vorgabeUebernehmen(b.iso, b.plan); });
        neu();
      },
    }, ['↺']);
  }
  return el('span', { text: '' });
}
