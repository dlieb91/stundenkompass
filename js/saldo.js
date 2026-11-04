/* Stundenkonto und Urlaubskonto – reine Rechnung, keine Oberflaeche.

   Modell eines Tages:
     wochenplan  gilt ab seinem Stichtag bis zum naechsten Wechsel
     soll        Stunden aus dem an *diesem* Tag gueltigen Wochenplan
     ist         Summe der Intervalle abzueglich Pause (siehe zeit.js)
     gutschrift  bezahlte Abwesenheit – Urlaub, Krankheit, Feiertag werden mit
                 dem Soll gutgeschrieben und aendern das Saldo daher nicht
     saldo       ist + gutschrift − soll

   Drei Festlegungen, die das Ergebnis praegen:

   1. Vor dem Erfassungsbeginn wird nichts gerechnet. Was davor liegt, steckt
      als einzige Zahl im Anfangsbestand (einstellungen.startsaldoStunden).
      Deshalb kann man im September anfangen und trotzdem 50 Ueberstunden haben.

   2. Tage in der Zukunft zaehlen nicht ins Stundensaldo. Ein eingeplanter
      Urlaub im November darf das heutige Konto nicht veraendern – er belastet
      aber sehr wohl schon das Urlaubsbudget, sonst plant man zweimal denselben Tag.

   3. Ein vergangener Arbeitstag ohne Eintrag ist ein Tag ohne Arbeit und geht
      mit seinem vollen Soll ins Minus. Er wird zugleich als Luecke gezaehlt,
      damit die Oberflaeche warnen kann, statt den Nutzer raten zu lassen.
*/

import { stundenZuMinuten, tageszeit } from './zeit.js';
import {
  feiertage, heuteISO, istWochenende, jahrVon, monatsTage, wochentag,
} from './kalender.js';

/* ---------- Tagesarten ----------
   gutschrift: 'voll'  Soll wird gutgeschrieben, das Saldo bleibt unberuehrt
               'halb'  halber Tag frei, halber Tag Arbeit
               'keine' das Soll bleibt stehen und muss erarbeitet werden */
export const TAGESARTEN = [
  { wert: 'arbeit', text: 'Arbeit', kurz: 'Arbeit', gutschrift: 'keine', urlaub: 0 },
  { wert: 'urlaub', text: 'Urlaub', kurz: 'Urlaub', gutschrift: 'voll', urlaub: 1 },
  { wert: 'urlaubHalb', text: 'Halber Urlaubstag', kurz: '½ Urlaub', gutschrift: 'halb', urlaub: 0.5 },
  { wert: 'krank', text: 'Krank', kurz: 'Krank', gutschrift: 'voll', urlaub: 0 },
  { wert: 'feiertag', text: 'Feiertag', kurz: 'Feiertag', gutschrift: 'voll', urlaub: 0 },
  { wert: 'frei', text: 'Frei', kurz: 'Frei', gutschrift: 'voll', urlaub: 0 },
  { wert: 'ausgleich', text: 'Freizeitausgleich', kurz: 'Ausgleich', gutschrift: 'keine', urlaub: 0 },
];

export const artMit = (wert) => TAGESARTEN.find((a) => a.wert === wert) || TAGESARTEN[0];

/* ---------- Wochenplaene ---------- */

/** Plaene in zeitlicher Reihenfolge; „von Anfang an" (gueltigAb = null) zuerst. */
export function planFolge(daten) {
  return [...(daten?.wochenplaene || [])].sort(
    (a, b) => String(a.gueltigAb || '').localeCompare(String(b.gueltigAb || ''))
  );
}

/**
 * Der an einem Tag gueltige Wochenplan: der letzte, dessen Stichtag nicht in
 * der Zukunft dieses Tages liegt. Dadurch wirkt ein Wechsel taggenau ab seinem
 * Stichtag und laesst alles davor unberuehrt – auch rueckwirkend, wenn jemand
 * einen alten Plan spaeter korrigiert.
 */
export function wochenplanFuer(iso, daten) {
  let treffer = null;
  for (const plan of planFolge(daten)) {
    if (!plan.gueltigAb || plan.gueltigAb <= iso) treffer = plan;
    else break;
  }
  return treffer;
}

/** Stichtage, die in einen Monat fallen – die Erfassung markiert sie. */
export function wechselImMonat(jahr, monat, daten) {
  const praefix = `${jahr}-${String(monat).padStart(2, '0')}`;
  return planFolge(daten).filter((p) => p.gueltigAb && p.gueltigAb.startsWith(praefix));
}

export function wochenSollMinuten(plan) {
  return (plan?.stunden || []).reduce((s, h) => s + stundenZuMinuten(h), 0);
}

/* ---------- Zeitraum der Rechnung ---------- */

/**
 * Ab wann gerechnet wird. Ohne gesetzten Erfassungsbeginn gilt der frueheste
 * erfasste Tag – so rechnet die App auch dann sinnvoll, wenn jemand einfach
 * losgetippt hat, ohne die Vorgaben auszufuellen.
 */
export function erfassungsBeginn(daten) {
  const gesetzt = daten?.einstellungen?.erfassungStart;
  if (gesetzt) return gesetzt;
  const schluessel = Object.keys(daten?.tage || {});
  return schluessel.length ? schluessel.sort()[0] : null;
}

/* Die Feiertagskarte je Jahr und Bundesland einmal ausrechnen. Die
   Monatsansicht fragt sie fuer jeden einzelnen Tag ab – ohne diesen Puffer
   liefe die Osterformel dreissigmal je Aufbau. */
const feiertagsPuffer = new Map();

export function feiertagsKarte(jahr, daten) {
  const e = daten?.einstellungen || {};
  if (e.feiertageAutomatisch === false) return new Map();
  const land = e.bundesland || 'BY';
  const schluessel = `${jahr}|${land}`;
  if (!feiertagsPuffer.has(schluessel)) feiertagsPuffer.set(schluessel, feiertage(jahr, land));
  return feiertagsPuffer.get(schluessel);
}

/* ---------- Ein Tag ---------- */

/**
 * Rechnet einen Kalendertag durch – auch einen, zu dem gar nichts erfasst ist.
 *
 * ktx.feiertage  vorberechnete Karte (spart Arbeit in Schleifen)
 * ktx.heute      fuer die Grenze zwischen „zaehlt" und „geplant"
 */
export function tagesBilanz(iso, daten, ktx = {}) {
  const heute = ktx.heute || heuteISO();
  const karte = ktx.feiertage || feiertagsKarte(jahrVon(iso), daten);
  const eintrag = daten?.tage?.[iso] || null;
  const plan = wochenplanFuer(iso, daten);
  const feiertagName = karte.get(iso) || null;

  const planSoll = plan ? stundenZuMinuten(plan.stunden?.[wochentag(iso)]) : 0;

  // Ohne eigenen Eintrag ergibt sich die Art aus dem Kalender: Feiertag,
  // Wochenende, sonst Arbeitstag. Ein gesetzter Eintrag geht immer vor –
  // wer am Feiertag gearbeitet hat, traegt das ein und bekommt es gutgeschrieben.
  let art = eintrag?.art;
  if (!art) art = feiertagName ? 'feiertag' : istWochenende(iso) ? 'frei' : 'arbeit';
  const artInfo = artMit(art);

  const zeit = tageszeit(eintrag, { projektpflicht: ktx.projektpflicht });
  const istMin = zeit.istMin;

  // Ein Feiertag oder ein freier Tag hat kein Soll – die Gutschrift hebt es auf.
  const gutschriftMin = artInfo.gutschrift === 'voll' ? planSoll
    : artInfo.gutschrift === 'halb' ? Math.round(planSoll / 2)
      : 0;

  const beginn = erfassungsBeginn(daten);
  const imZeitraum = !!beginn && iso >= beginn;
  const zaehlt = imZeitraum && iso <= heute;
  const geplant = imZeitraum && iso > heute;

  // Urlaub an einem ohnehin freien Tag verbraucht keinen Urlaubstag. Sonst
  // wuerde ein Urlaub ueber zwei Wochen vierzehn statt zehn Tage kosten – und
  // ein Feiertag mitten in der Urlaubswoche einen Tag, den kein Arbeitgeber
  // abzieht.
  const arbeitspflicht = planSoll > 0 && !feiertagName;
  const urlaubAnteil = arbeitspflicht ? artInfo.urlaub : 0;

  const luecke = zaehlt && art === 'arbeit' && planSoll > 0 && istMin === 0;

  return {
    iso,
    art,
    artInfo,
    feiertagName,
    plan,
    sollMin: planSoll,
    istMin,
    bruttoMin: zeit.bruttoMin,
    pauseMin: zeit.pauseMin,
    gutschriftMin,
    saldoMin: zaehlt ? istMin + gutschriftMin - planSoll : 0,
    urlaubAnteil,
    arbeitspflicht,
    zaehlt,
    geplant,
    luecke,
    erfasst: !!eintrag && (zeit.bruttoMin > 0 || !!eintrag.art),
    warnungen: zeit.warnungen,
  };
}

/* ---------- Monat und Jahr ---------- */

function summieren(bilanzen) {
  const summe = {
    sollMin: 0, istMin: 0, gutschriftMin: 0, saldoMin: 0,
    urlaubTage: 0, urlaubGeplant: 0, krankTage: 0, luecken: 0, warnungen: 0,
  };
  for (const b of bilanzen) {
    summe.sollMin += b.sollMin;
    summe.istMin += b.istMin;
    summe.gutschriftMin += b.gutschriftMin;
    summe.saldoMin += b.saldoMin;
    if (b.geplant) summe.urlaubGeplant += b.urlaubAnteil;
    else summe.urlaubTage += b.urlaubAnteil;
    if (b.art === 'krank') summe.krankTage += 1;
    if (b.luecke) summe.luecken += 1;
    if (b.warnungen.length) summe.warnungen += 1;
  }
  return summe;
}

export function monatsBilanz(jahr, monat, daten, ktx = {}) {
  const karte = ktx.feiertage || feiertagsKarte(jahr, daten);
  const heute = ktx.heute || heuteISO();
  const tage = monatsTage(jahr, monat)
    .map((iso) => tagesBilanz(iso, daten, { feiertage: karte, heute, projektpflicht: ktx.projektpflicht }));
  return { jahr, monat, tage, ...summieren(tage) };
}

export function jahresBilanz(jahr, daten, ktx = {}) {
  const karte = feiertagsKarte(jahr, daten);
  const heute = ktx.heute || heuteISO();
  const monate = [];
  let kumuliert = 0;
  for (let m = 1; m <= 12; m++) {
    const bilanz = monatsBilanz(jahr, m, daten, { feiertage: karte, heute, projektpflicht: ktx.projektpflicht });
    kumuliert += bilanz.saldoMin;
    monate.push({ ...bilanz, kumuliertMin: kumuliert });
  }
  const summe = monate.reduce((s, m) => ({
    sollMin: s.sollMin + m.sollMin,
    istMin: s.istMin + m.istMin,
    saldoMin: s.saldoMin + m.saldoMin,
    urlaubTage: s.urlaubTage + m.urlaubTage,
    urlaubGeplant: s.urlaubGeplant + m.urlaubGeplant,
    krankTage: s.krankTage + m.krankTage,
    luecken: s.luecken + m.luecken,
    warnungen: s.warnungen + m.warnungen,
  }), { sollMin: 0, istMin: 0, saldoMin: 0, urlaubTage: 0, urlaubGeplant: 0, krankTage: 0, luecken: 0, warnungen: 0 });
  return { jahr, monate, ...summe };
}

/* ---------- Stundenkonto insgesamt ---------- */

/**
 * Anfangsbestand plus alle Tage vom Erfassungsbeginn bis einschliesslich
 * heute. Es wird Tag fuer Tag gegangen und nicht nur ueber die erfassten
 * Eintraege – gerade die *nicht* erfassten Arbeitstage sind der Grund, warum
 * ein Konto ins Minus laeuft.
 */
export function gesamtSaldo(daten, bisISO) {
  const beginn = erfassungsBeginn(daten);
  const start = stundenZuMinuten(daten?.einstellungen?.startsaldoStunden ?? 0);
  if (!beginn) return { saldoMin: start, startMin: start, laufendMin: 0, luecken: 0, tage: 0 };

  const bis = bisISO || heuteISO();
  let laufend = 0;
  let luecken = 0;
  let tage = 0;
  let jahr = jahrVon(beginn);
  let karte = feiertagsKarte(jahr, daten);

  for (let iso = beginn; iso <= bis; iso = tagePlusIntern(iso)) {
    const j = jahrVon(iso);
    if (j !== jahr) { jahr = j; karte = feiertagsKarte(jahr, daten); }
    const b = tagesBilanz(iso, daten, { feiertage: karte, heute: bis });
    laufend += b.saldoMin;
    if (b.luecke) luecken += 1;
    tage += 1;
  }
  return { saldoMin: start + laufend, startMin: start, laufendMin: laufend, luecken, tage };
}

/* Eigene Tagesaddition, damit gesamtSaldo ohne Umweg ueber ein Date-Objekt je
   Schleifendurchlauf auskommt – bei mehreren Jahren sind das schnell tausend. */
function tagePlusIntern(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/* ---------- Urlaubskonto ---------- */

export function urlaubJahr(jahr, daten) {
  return daten?.jahre?.[String(jahr)] || null;
}

/** Jahre, zu denen etwas hinterlegt ist – aufsteigend. */
export function urlaubsJahre(daten) {
  return Object.keys(daten?.jahre || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
}

/**
 * Urlaubsbilanz eines Jahres.
 *
 * Der Uebertrag ist ein Zahlenfeld: steht dort nichts, wird der Rest des
 * Vorjahres uebernommen – aber nur, wenn zum Vorjahr ueberhaupt etwas
 * hinterlegt ist. Die Kette endet damit sauber im ersten gepflegten Jahr,
 * statt sich in die Vergangenheit zu rechnen.
 *
 * genommenVorher ist der Urlaub, der im selben Jahr schon *vor* dem
 * Erfassungsbeginn verbraucht wurde. Er steht als eigene Zahl da und wird
 * nicht in den Uebertrag hineingerechnet: wer im September einsteigt und
 * noch zwei Tage uebrig hat, soll „30 Anspruch, 28 bereits genommen" lesen
 * und nicht ein blosses „2", das seine Herkunft verschweigt.
 */
export function urlaubsBilanz(jahr, daten, ktx = {}) {
  const heute = ktx.heute || heuteISO();
  const eintrag = urlaubJahr(jahr, daten);
  const anspruch = eintrag?.anspruch ?? 0;
  const vorher = eintrag?.genommenVorher ?? 0;

  let uebertrag = eintrag?.uebertrag;
  let uebertragAutomatisch = false;
  if (uebertrag == null) {
    uebertragAutomatisch = true;
    uebertrag = urlaubJahr(jahr - 1, daten)
      ? Math.max(0, urlaubsBilanz(jahr - 1, daten, { heute }).verbleibend)
      : 0;
  }

  const karte = feiertagsKarte(jahr, daten);
  let genommen = 0;
  let geplant = 0;
  for (const iso of Object.keys(daten?.tage || {})) {
    if (jahrVon(iso) !== jahr) continue;
    const b = tagesBilanz(iso, daten, { feiertage: karte, heute });
    if (!b.urlaubAnteil) continue;
    if (iso > heute) geplant += b.urlaubAnteil;
    else genommen += b.urlaubAnteil;
  }

  const gesamt = anspruch + uebertrag;
  return {
    jahr, anspruch, uebertrag, uebertragAutomatisch, gesamt,
    vorher, genommen, geplant,
    verbleibend: gesamt - vorher - genommen - geplant,
  };
}
