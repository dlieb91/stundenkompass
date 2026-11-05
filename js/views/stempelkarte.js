/* Stempeluhr-Karte – steht oben im Dashboard, auf PC, iPad und Handy gleich.

   Grosse Knoepfe, eine laufende Uhr, und die eine Zahl, die man beim
   Stempeln wissen will: wie viel heute schon zusammengekommen ist und wann
   das Tagessoll erreicht ist. Gerechnet wird in stempeluhr.js und saldo.js;
   diese Datei zeigt nur an und ruft aendern() auf.

   Die Karte haelt eine Uhr am Laufen (alle 15 Sekunden). Sie aktualisiert
   nur ihre eigenen Textknoten – ein Neuaufbau risse sonst eine gerade
   geoeffnete Projektauswahl zu. Wechselt das Datum, wird das ganze
   Dashboard neu aufgebaut. Ist die Karte nicht mehr im Dokument, beendet
   sich die Uhr selbst.

   Im Team erscheint sie nur fuer den eigenen Datensatz: Wer als Verwaltung
   einen Mitarbeiter betrachtet, stempelt nicht fuer ihn. */

import { el, toast } from '../util.js';
import { state, aendern } from '../store.js';
import { heuteISO, WOCHENTAGE_LANG, wochentag } from '../kalender.js';
import { tagesBilanz } from '../saldo.js';
import { stundenText } from '../zeit.js';
import {
  uhrzeitVon, offenerAbschnitt, abschnitte, kommen, beenden, projektWechseln, sollErreichtUm,
} from '../stempeluhr.js';
import {
  aktiveProjekte, projekteFuerAuswahl, projektMit, projektGenutzt, projektpflicht,
} from '../stammdaten.js';
import { betrachtetSichSelbst } from '../sitzung.js';
import { istEinzel } from '../betrieb.js';

const PROJEKT_KEY = 'stundenkompass-stempel-projekt';

export const stempelnErlaubt = () => istEinzel() || betrachtetSichSelbst();

function projektVorschlag() {
  let id = null;
  try { id = localStorage.getItem(PROJEKT_KEY); } catch { /* egal */ }
  return id && projektMit(id)?.aktiv ? id : '';
}

function projektMerken(id) {
  try { localStorage.setItem(PROJEKT_KEY, id || ''); } catch { /* egal */ }
  if (id) projektGenutzt(id);
}

/** Lage im Moment: was laeuft, was ist heute schon da, wie steht das Soll. */
function lage() {
  const jetzt = new Date();
  const uhr = uhrzeitVon(jetzt);
  const heute = heuteISO();
  const d = state.daten;
  const offen = offenerAbschnitt(d, heute, uhr);
  const b = tagesBilanz(heute, d, { heute });
  // Laufende Minuten zaehlen erst, wenn der Abschnitt heute begann – ein
  // Abschnitt seit gestern gehoert in die Bilanz von gestern.
  const istMin = b.istMin + (offen && !offen.gestern ? offen.laufMin : 0);
  const sollMin = Math.max(0, b.sollMin - b.gutschriftMin);
  return { jetzt, uhr, heute, offen, b, istMin, sollMin, liste: abschnitte(d, heute) };
}

export function stempelKarte(neu) {
  const l0 = lage();
  const mitProjekt = aktiveProjekte().length > 0;
  const pflicht = projektpflicht();

  /* ---------- Knoten, die die Uhr spaeter nachfuehrt ---------- */

  const uhrText = el('div.stempel-uhr', { text: l0.uhr });
  const statusText = el('div.stempel-status');
  const istText = el('div.stempel-ist');
  const sollText = el('div.stempel-soll');

  const nachfuehren = () => {
    const l = lage();
    if (l.heute !== l0.heute) { neu(); return; }
    uhrText.textContent = l.uhr;
    istText.textContent = stundenText(l.istMin);
    if (l.offen) {
      statusText.textContent = l.offen.gestern
        ? `Eingestempelt seit gestern ${l.offen.von} · ${stundenText(l.offen.laufMin)}`
        : `Eingestempelt seit ${l.offen.von} · ${stundenText(l.offen.laufMin)}`;
    } else if (l.liste.length) {
      statusText.textContent = `Ausgestempelt seit ${l.liste[l.liste.length - 1].bis || '–'}`;
    } else {
      statusText.textContent = 'Heute noch nicht eingestempelt';
    }
    const rest = l.sollMin - l.istMin;
    const um = l.offen && !l.offen.gestern ? sollErreichtUm(l.uhr, rest) : null;
    sollText.textContent = l.sollMin === 0
      ? 'heute kein Soll'
      : rest <= 0
        ? `Soll ${stundenText(l.sollMin)} erreicht · ${stundenText(-rest, { vorzeichen: true })}`
        : `von ${stundenText(l.sollMin)} Soll${um ? ` · erreicht um ${um} ohne weitere Pause` : ` · noch ${stundenText(rest)}`}`;
  };
  nachfuehren();

  /* ---------- Aktionen ---------- */

  let projektWahl = null;

  const ausfuehren = (fn, meldung) => {
    const uhr = uhrzeitVon(new Date());
    const heute = heuteISO();
    aendern((d) => fn(d, uhr, heute));
    if (meldung) toast(meldung.replace('{uhr}', uhr), 'ok');
    neu();
  };

  const kommenKlick = () => {
    const pid = projektWahl?.value || null;
    if (pflicht && mitProjekt && !pid) {
      toast('Bitte zuerst ein Projekt wählen.', 'info');
      projektWahl?.focus();
      return;
    }
    projektMerken(pid);
    ausfuehren((d, uhr, heute) => kommen(d, heute, uhr, pid), 'Eingestempelt um {uhr}');
  };

  const beendenKlick = (art) => {
    const { offen } = lage();
    if (!offen) { neu(); return; }
    ausfuehren((d, uhr) => beenden(d, offen, uhr),
      art === 'pause' ? 'Pause ab {uhr}' : 'Ausgestempelt um {uhr}');
  };

  if (mitProjekt) {
    projektWahl = el('select', {
      'aria-label': 'Projekt',
      onchange: () => {
        const pid = projektWahl.value || null;
        projektMerken(pid);
        const { offen } = lage();
        // Laeuft gerade etwas, wird ab jetzt auf das neue Projekt gebucht.
        if (offen && !offen.gestern && (offen.projektId || null) !== pid) {
          ausfuehren((d, uhr, heute) => projektWechseln(d, offen, heute, uhr, pid), 'Ab {uhr} auf das neue Projekt');
        }
      },
    }, [
      el('option', { value: '', text: pflicht ? '– Projekt wählen –' : '– kein Projekt –' }),
      ...projekteFuerAuswahl().map((p) => el('option', { value: p.wert, text: p.text })),
    ]);
    projektWahl.value = l0.offen && !l0.offen.gestern ? (l0.offen.projektId || '') : projektVorschlag();
  }

  const knopf = (text, klasse, onclick) => el('button.btn.stempel-knopf' + klasse, { type: 'button', onclick: (e) => {
    // Doppeltippen am Handy erzeugte sonst zwei Abschnitte in derselben Minute.
    e.currentTarget.disabled = true;
    onclick();
  } }, [text]);

  let knoepfe;
  if (!l0.offen) {
    knoepfe = [knopf(l0.liste.length ? 'Weiter arbeiten' : 'Kommen', '.btn-primary', kommenKlick)];
  } else {
    knoepfe = [
      knopf('Pause', '', () => beendenKlick('pause')),
      knopf('Gehen', '.btn-primary', () => beendenKlick('gehen')),
    ];
  }

  /* ---------- Hinweise ---------- */

  const hinweise = [];
  if (l0.offen?.vergessen) {
    hinweise.push(el('div.stempel-hinweis.warn', {}, [
      `Seit ${l0.offen.gestern ? 'gestern ' : ''}${l0.offen.von} eingestempelt – vergessen auszustempeln? `,
      el('a', { href: '#/erfassung', text: 'In der Erfassung korrigieren' }),
    ]));
  }
  if (['urlaub', 'krank', 'ausgleich'].includes(l0.b.art) && !l0.offen) {
    hinweise.push(el('div.stempel-hinweis', {
      text: `Heute ist als „${l0.b.artInfo.text}" eingetragen. Gestempelte Zeit zählt zusätzlich.`,
    }));
  }

  const liste = l0.liste.length
    ? el('div.stempel-liste', {}, l0.liste.map((iv) => el('span.stempel-abschnitt', {
      text: `${iv.von}–${iv.bis || 'läuft'}${iv.projektId && projektMit(iv.projektId) ? ' · ' + (projektMit(iv.projektId).code || projektMit(iv.projektId).name) : ''}`,
    })))
    : null;

  const karte = el('div.card.stempel-karte', { dataset: { zustand: l0.offen ? 'laeuft' : 'aus' } }, [
    el('div.card-body', {}, [
      el('div.stempel-kopf', {}, [
        el('div', {}, [
          el('div.stempel-tag', { text: `${WOCHENTAGE_LANG[wochentag(l0.heute)]}, ${l0.heute.slice(8, 10)}.${l0.heute.slice(5, 7)}.` }),
          statusText,
        ]),
        uhrText,
      ]),
      el('div.stempel-mitte', {}, [
        el('div', {}, [el('div.stempel-label', { text: 'Heute gearbeitet' }), istText, sollText]),
      ]),
      el('div.stempel-aktion', {}, [
        projektWahl ? el('div.stempel-projekt', {}, [projektWahl]) : null,
        el('div.stempel-knoepfe', {}, knoepfe),
      ]),
      ...hinweise,
      liste,
      el('a.stempel-link', { href: '#/erfassung', text: 'Zeiten von Hand bearbeiten →' }),
    ]),
  ]);

  /* ---------- Uhr ---------- */

  const takt = setInterval(() => {
    if (!karte.isConnected) { clearInterval(takt); document.removeEventListener('visibilitychange', sichtbar); return; }
    nachfuehren();
  }, 15000);
  // Kommt die App aus dem Hintergrund zurueck (Handy!), sofort nachziehen –
  // nicht erst beim naechsten Takt.
  const sichtbar = () => {
    if (!karte.isConnected) { document.removeEventListener('visibilitychange', sichtbar); return; }
    if (document.visibilityState === 'visible') nachfuehren();
  };
  document.addEventListener('visibilitychange', sichtbar);

  return karte;
}
