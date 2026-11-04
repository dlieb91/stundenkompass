/* Vorgaben – alles, was die Rechnung steuert, bevor der erste Tag erfasst wird.

   Vier Karten in der Reihenfolge, in der man sie beim Einrichten braucht:
   Regelarbeitszeit, Erfassungsbeginn mit Anfangsbestand, Urlaub je Jahr,
   Feiertage.

   Die Regelarbeitszeit ist bewusst eine Liste und kein einzelner Wochenplan.
   Wer im April auf Teilzeit wechselt, haengt einen zweiten Plan mit Stichtag an;
   der erste bleibt unangetastet und die Vergangenheit damit auch.
*/

import { el, leeren, num, datum, modal, bestaetigen, toast } from '../util.js';
import {
  zahlFeld, zeitFeld, datumFeld, textFeld, auswahlFeld, schalterFeld, anzeigeFeld,
  tabellenZahl, felderGitter, abschnitt, hinweis,
} from '../felder.js';
import { state, aendern, neuerWochenplan, jahrHolen } from '../store.js';
import { BUNDESLAENDER, WOCHENTAGE, WOCHENTAGE_LANG, feiertage, heuteISO, tagePlus } from '../kalender.js';
import { planFolge, wochenSollMinuten, urlaubsBilanz, urlaubsJahre } from '../saldo.js';
import { stundenText, intervallDauer } from '../zeit.js';
import { gewaehltesJahr } from '../ansicht.js';
import { darfVorgabenBearbeiten } from '../sitzung.js';

export const vorgaben = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    const neu = () => { leeren(container); this.render(container); };
    const gesperrt = !darfVorgabenBearbeiten();

    if (gesperrt) {
      inner.append(hinweis(
        'Diese Werte werden von der Verwaltung gepflegt. Bei Fragen dazu wende dich an deine Verwaltung.'
      ));
    }

    inner.append(arbeitszeitKarte(neu, gesperrt));
    inner.append(beginnKarte(neu, gesperrt));
    inner.append(urlaubKarte(neu, gesperrt));
    inner.append(feiertagKarte(neu, gesperrt));
  },
};

/* ---------- Regelarbeitszeit ---------- */

function gueltigkeitText(plan, naechster) {
  const von = plan.gueltigAb ? `ab ${datum(plan.gueltigAb)}` : 'von Anfang an';
  if (!naechster || !naechster.gueltigAb) return von;
  return `${plan.gueltigAb ? datum(plan.gueltigAb) : 'Anfang'} – ${datum(tagePlus(naechster.gueltigAb, -1))}`;
}

function arbeitszeitKarte(neu, gesperrt) {
  const plaene = planFolge(state.daten);

  const karten = plaene.map((plan, i) => planKarte(plan, plaene[i + 1], i === 0, plaene.length, neu, gesperrt));

  const kopf = el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Regelarbeitszeit' }),
        el('div.sub', { text: plaene.length > 1 ? `${plaene.length} Zeitmodelle im Verlauf` : 'Sollstunden je Wochentag' }),
      ]),
      gesperrt ? null : el('button.btn.btn-sm', {
        type: 'button',
        onclick: () => wechselAnlegen(plaene, neu),
      }, ['Wechsel der Arbeitszeit …']),
    ]),
    el('div.card-body', {}, [
      hinweis('Das <strong>Soll</strong> eines Tages kommt aus dem Wochenplan, der an diesem Tag gilt. '
        + 'Ein Wechsel wirkt taggenau ab seinem Stichtag – er rechnet die Vergangenheit nicht um. '
        + 'Freie Tage bekommen null Stunden; ein Tag mit null Stunden erzeugt nie Minusstunden.'),
    ]),
  ]);

  return el('div', { style: 'display:grid;gap:16px' }, [kopf, ...karten]);
}

/** Der bis zu einem Stichtag geltende Plan – Vorlage fuer den neuen. */
function planBis(plaene, ab) {
  let vorlage = plaene[0];
  for (const p of plaene) if (!p.gueltigAb || p.gueltigAb <= ab) vorlage = p;
  return vorlage;
}

async function wechselAnlegen(plaene, neu) {
  const eingabe = el('input', { type: 'date', value: heuteISO().slice(0, 8) + '01' });
  const folge = el('div.note', { style: 'margin:14px 0 0' });

  // Zeigt vor dem Übernehmen, was der Wechsel bedeutet: welches Modell bis
  // dahin gilt und womit der neue Plan vorbelegt wird.
  const folgeSetzen = () => {
    leeren(folge);
    const ab = eingabe.value;
    if (!ab) { folge.append(el('div', { text: 'Bitte einen Stichtag wählen.' })); return; }
    if (plaene.some((p) => p.gueltigAb === ab)) {
      folge.append(el('div', { text: 'Zu diesem Stichtag gibt es bereits ein Zeitmodell.' }));
      return;
    }
    const vorlage = planBis(plaene, ab);
    folge.append(el('div', {
      text: `Bis zum ${datum(tagePlus(ab, -1))} gilt weiterhin „${vorlage.bezeichnung}" `
        + `mit ${stundenText(wochenSollMinuten(vorlage))} je Woche. `
        + 'Das neue Modell wird damit vorbelegt – du änderst nur, was sich wirklich ändert.',
    }));
  };
  eingabe.addEventListener('change', folgeSetzen);
  folgeSetzen();

  const ok = await modal({
    titel: 'Wechsel der Arbeitszeit',
    beschreibung: 'Ab welchem Tag gilt die neue Arbeitszeit? Alles davor bleibt unverändert – '
      + 'das Stundenkonto der Vergangenheit wird nicht neu gerechnet.',
    inhalt: el('div.field', {}, [el('label', { text: 'Gültig ab' }), eingabe]),
    buttons: [
      { text: 'Abbrechen', wert: false },
      { text: 'Übernehmen', wert: true, klasse: 'btn-primary' },
    ],
  });
  if (!ok) return;

  const ab = eingabe.value;
  if (!ab) { toast('Kein Stichtag gewählt', 'err'); return; }
  if (plaene.some((p) => p.gueltigAb === ab)) { toast('Zu diesem Stichtag gibt es schon ein Modell', 'err'); return; }

  aendern((d) => { d.wochenplaene.push(neuerWochenplan(ab, planBis(plaene, ab))); });
  toast(`Neues Zeitmodell ab ${datum(ab)} angelegt`, 'ok');
  neu();
}

function planKarte(plan, naechster, istErster, anzahl, neu, gesperrt) {
  const wochenMin = wochenSollMinuten(plan);
  const o = { bezug: plan.id, nach: neu, gesperrt };

  const stundenFelder = WOCHENTAGE.map((kurz, i) => zahlFeld(kurz, plan.stunden, i, {
    ...o, nachkomma: 2, suffix: 'h', label: `Soll ${WOCHENTAGE_LANG[i]}`,
  }));

  const vorgabeMin = intervallDauer({ von: plan.vorgabeVon, bis: plan.vorgabeBis });
  const nettoVorgabe = vorgabeMin == null ? null : vorgabeMin - (plan.vorgabePauseMin || 0);

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: plan.bezeichnung || 'Ohne Bezeichnung' }),
        el('div.sub', { text: `${gueltigkeitText(plan, naechster)} · ${stundenText(wochenMin)} je Woche` }),
      ]),
      anzahl > 1 && !istErster && !gesperrt
        ? el('button.btn.btn-sm.btn-danger', {
          type: 'button',
          onclick: async () => {
            const ja = await bestaetigen(
              'Zeitmodell löschen',
              `„${plan.bezeichnung}" wird entfernt. Ab dem ${datum(plan.gueltigAb)} gilt dann wieder das davor gültige Modell – `
              + 'das Stundenkonto ändert sich dadurch rückwirkend.',
              { okText: 'Löschen', gefahr: true }
            );
            if (!ja) return;
            aendern((d) => { d.wochenplaene = d.wochenplaene.filter((p) => p.id !== plan.id); });
            neu();
          },
        }, ['Löschen'])
        : null,
    ]),
    el('div.card-body', {}, [
      felderGitter([
        textFeld('Bezeichnung', plan, 'bezeichnung', { ...o, platzhalter: 'z. B. Teilzeit 30 h' }),
        istErster
          ? anzeigeFeld('Gültig ab', 'von Anfang an', { hint: 'Der erste Plan gilt für alles, was vor dem nächsten Stichtag liegt.' })
          : datumFeld('Gültig ab', plan, 'gueltigAb', { ...o, hint: 'ab diesem Tag, einschließlich' }),
      ], 240),

      el('div.sub', { text: 'Sollstunden je Wochentag', style: 'margin:14px 0 6px' }),
      felderGitter(stundenFelder, 92),

      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 16px' }, [
        gesperrt ? null : schnellKnopf('5 × 8 h', [8, 8, 8, 8, 8, 0, 0], plan, neu),
        gesperrt ? null : schnellKnopf('5 × 7,7 h', [7.7, 7.7, 7.7, 7.7, 7.7, 0, 0], plan, neu),
        gesperrt ? null : schnellKnopf('4-Tage-Woche', [10, 10, 10, 10, 0, 0, 0], plan, neu),
        el('div.readonly.betont', { text: stundenText(wochenMin) + ' je Woche', style: 'margin-left:auto' }),
      ]),

      el('div.sub', { text: 'Vorgabezeiten für die Erfassung', style: 'margin:0 0 6px' }),
      hinweis('Diese Zeiten füllt der Knopf <strong>Vorgabe übernehmen</strong> in der Erfassung ein. '
        + 'Sie gehören zum Zeitmodell: wer auf Teilzeit wechselt, ändert meist auch Beginn und Ende.'),
      felderGitter([
        zeitFeld('Beginn', plan, 'vorgabeVon', o),
        zeitFeld('Ende', plan, 'vorgabeBis', o),
        zahlFeld('Pause', plan, 'vorgabePauseMin', { ...o, nachkomma: 0, suffix: 'min' }),
        anzeigeFeld('ergibt', nettoVorgabe == null ? '–' : stundenText(nettoVorgabe), { klasse: 'betont' }),
      ], 150),
    ]),
  ]);
}

function schnellKnopf(text, werte, plan, neu) {
  return el('button.btn.btn-sm', {
    type: 'button',
    onclick: () => { aendern(() => { plan.stunden = [...werte]; }); neu(); },
  }, [text]);
}

/* ---------- Beginn und Anfangsbestand ---------- */

function beginnKarte(neu, gesperrt) {
  const e = state.daten.einstellungen;
  const o = { nach: neu, gesperrt };

  return abschnitt(
    'Beginn der Erfassung',
    'ab wann gerechnet wird und was vorher schon auf dem Konto stand',
    felderGitter([
      datumFeld('Erfassung beginnt am', e, 'erfassungStart', {
        ...o, hint: 'Vor diesem Tag wird nichts gerechnet – auch keine Minusstunden.',
      }),
      zahlFeld('Anfangsbestand', e, 'startsaldoStunden', {
        ...o, nachkomma: 2, suffix: 'h',
        hint: 'Überstunden zum Erfassungsbeginn. Ein Minus wird mit Vorzeichen eingetragen.',
      }),
    ], 240),
    'Wer mitten im Jahr anfängt, trägt hier ein, was er mitbringt. Beispiel: Beginn am 1. September '
    + 'mit <strong>50 Stunden</strong> Anfangsbestand – das Konto startet dann bei 50 Stunden und rechnet '
    + 'ab September Tag für Tag weiter. Die Monate davor bleiben leer und erzeugen keine Minusstunden.'
  );
}

/* ---------- Urlaub je Jahr ---------- */

function urlaubKarte(neu, gesperrt) {
  const jahre = urlaubsJahre(state.daten);
  const heute = heuteISO();

  const zeilen = jahre.map((jahr) => {
    const eintrag = state.daten.jahre[String(jahr)];
    const b = urlaubsBilanz(jahr, state.daten, { heute });
    return el('tr', {}, [
      el('td', { text: String(jahr), style: 'font-weight:600' }),
      el('td', {}, [tabellenZahl(eintrag, 'anspruch', { nachkomma: 1, nach: neu, platzhalter: '0', gesperrt })]),
      el('td', {}, [tabellenZahl(eintrag, 'uebertrag', {
        nachkomma: 1, nach: neu, gesperrt,
        // Der Platzhalter zeigt, was ohne Eingabe gilt – ein leeres Feld heisst
        // hier „aus dem Vorjahr uebernehmen", nicht „null Tage".
        platzhalter: num(b.uebertrag, 1),
        title: b.uebertragAutomatisch ? 'Leer = Rest des Vorjahres' : 'Von Hand gesetzt',
      })]),
      el('td.num', { text: num(b.gesamt, 1) }),
      el('td', {}, [tabellenZahl(eintrag, 'genommenVorher', { nachkomma: 1, nach: neu, platzhalter: '0', gesperrt })]),
      el('td.num', { text: b.genommen ? num(b.genommen, 1) : '–' }),
      el('td.num' + (b.geplant ? '.dim' : ''), { text: b.geplant ? num(b.geplant, 1) : '–' }),
      el('td.num' + (b.verbleibend < 0 ? '.neg' : '.pos'), { text: num(b.verbleibend, 1), style: 'font-weight:600' }),
    ]);
  });

  const tabelle = zeilen.length
    ? el('div', { style: 'overflow-x:auto' }, [
      el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Jahr' }),
          el('th', { text: 'Anspruch', style: 'width:96px' }),
          el('th', { text: 'Übertrag', style: 'width:96px' }),
          el('th', { text: 'gesamt', style: 'text-align:right' }),
          el('th', { text: 'vorher genommen', style: 'width:110px' }),
          el('th', { text: 'erfasst', style: 'text-align:right' }),
          el('th', { text: 'geplant', style: 'text-align:right' }),
          el('th', { text: 'Rest', style: 'text-align:right' }),
        ])]),
        el('tbody', {}, zeilen),
      ]),
    ])
    : el('div.empty', {}, [
      el('div.empty-icon', { text: '🌴' }),
      el('h3', { text: 'Noch kein Jahr angelegt' }),
      el('p', { text: 'Lege das Jahr an, für das du deinen Urlaub führen willst.' }),
    ]);

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Urlaub je Jahr' }),
        el('div.sub', { text: 'Anspruch und Übertrag – in Tagen' }),
      ]),
      gesperrt ? null : el('button.btn.btn-sm', {
        type: 'button',
        onclick: () => {
          const naechstes = jahre.length ? Math.max(...jahre) + 1 : Number(heute.slice(0, 4));
          aendern(() => { jahrHolen(naechstes); });
          toast(`${naechstes} angelegt`, 'ok');
          neu();
        },
      }, ['Jahr hinzufügen']),
    ]),
    el('div.card-body', {}, [
      hinweis('Ein leeres Feld bei <strong>Übertrag</strong> übernimmt den Rest des Vorjahres; '
        + 'der Platzhalter zeigt, welcher Wert das wäre.<br><br>'
        + 'Unter <strong>vorher genommen</strong> steht der Urlaub, der in diesem Jahr schon vor dem '
        + 'Erfassungsbeginn verbraucht wurde. Wer im September einsteigt und noch 2 Tage übrig hat, trägt '
        + '<strong>30</strong> Anspruch und <strong>28</strong> vorher genommen ein – und sieht damit, wohin '
        + 'die Tage gegangen sind, statt nur einen Rest von 2 vorzufinden.<br><br>'
        + 'Verfallsfristen rechnet die App nicht.'),
      tabelle,
    ]),
  ]);
}

/* ---------- Feiertage ---------- */

function feiertagKarte(neu, gesperrt) {
  const e = state.daten.einstellungen;
  const jahr = gewaehltesJahr();
  const liste = e.feiertageAutomatisch === false
    ? []
    : [...feiertage(jahr, e.bundesland || 'BY').entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const vorschau = liste.length
    ? el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:2px 18px' },
      liste.map(([iso, name]) => el('div', { style: 'display:flex;justify-content:space-between;gap:12px;font-size:12.5px;padding:2px 0' }, [
        el('span', { text: name }),
        el('span.dim.num', { text: datum(iso) }),
      ])))
    : el('div.dim', { text: 'Feiertage werden nicht automatisch gesetzt. Freie Tage trägst du in der Erfassung selbst ein.' });

  return abschnitt(
    'Feiertage',
    `gesetzliche Feiertage ${jahr}`,
    [
      felderGitter([
        auswahlFeld('Bundesland', e, 'bundesland',
          BUNDESLAENDER.map((l) => ({ wert: l.id, text: l.name })), { nach: neu, gesperrt }),
      ], 260),
      schalterFeld('Feiertage automatisch berücksichtigen', e, 'feiertageAutomatisch', {
        nach: neu, gesperrt, hint: 'Ein Feiertag hat kein Soll und erzeugt daher keine Minusstunden.',
      }),
      el('div', { style: 'margin-top:12px' }, [vorschau]),
    ],
    'Einzelne Tage lassen sich in der Erfassung jederzeit überschreiben – wer am Feiertag gearbeitet hat, '
    + 'stellt die Tagesart auf <strong>Arbeit</strong> und trägt seine Zeiten ein. Gemeindeweise Sonderfälle '
    + '(Fronleichnam in Sachsen und Thüringen, Mariä Himmelfahrt in Bayern) sind nicht enthalten.'
  );
}
