/* Datenmodell, Zustand und Aenderungsverwaltung.

   Aufbau der Datendatei:

     einstellungen   Erfassungsbeginn, Anfangsbestand, Bundesland
     wochenplaene[]  die Regelarbeitszeit als *Verlauf*: jeder Eintrag gilt ab
                     seinem Stichtag bis zum naechsten. Der erste Eintrag hat
                     gueltigAb = null und bedeutet „von Anfang an". Wer auf
                     Teilzeit wechselt, haengt einen zweiten Plan an, statt den
                     ersten zu aendern – sonst waere die Vergangenheit umgerechnet.
     jahre{}         je Jahr Urlaubsanspruch, Uebertrag und der schon vor dem
                     Erfassungsbeginn genommene Urlaub. Ein leerer Uebertrag
                     heisst „aus dem Vorjahr uebernehmen", eine gesetzte Zahl
                     gewinnt. Wer mitten im Jahr einsteigt, traegt den bis dahin
                     verbrauchten Urlaub unter genommenVorher ein – er bleibt
                     dadurch sichtbar, statt im Uebertrag zu verschwinden.
     tage{}          iso -> erfasster Tag. Nur was abweicht, steht drin: ein
                     gewoehnlicher Wochenendtag braucht keinen Eintrag.
     protokoll[]     jede Feldaenderung mit vorher/nachher/wer
     meta.version    fortlaufende Zahl; der Server lehnt einen Schreibvorgang
                     mit veralteter Version ab (409), statt eine gleichzeitige
                     Aenderung stillschweigend zu ueberschreiben

   Ein Tag:
     art         siehe TAGESARTEN in saldo.js
     intervalle  beliebig viele { von, bis }; die Luecke dazwischen ist Pause
     pauseMin    zusaetzlich abgezogene Pause in Minuten
*/

import { uid, zeitstempel } from './util.js';
import { planeSpeichern } from './storage.js';
import { heuteISO } from './kalender.js';
import { wer } from './sitzung.js';

export const SCHEMA_VERSION = 4;

/* ---------- Vorgabewerte ---------- */

export const STANDARD_EINSTELLUNGEN = {
  erfassungStart: null,      // ISO; davor wird nichts gerechnet
  startsaldoStunden: 0,      // Ueberstunden, die vor dem Beginn schon bestanden
  bundesland: 'BY',
  feiertageAutomatisch: true,
};

export const STANDARD_WOCHENPLAN = {
  bezeichnung: 'Vollzeit',
  stunden: [8, 8, 8, 8, 8, 0, 0],   // Mo .. So
  vorgabeVon: '08:00',
  vorgabeBis: '17:00',
  vorgabePauseMin: 60,
};

export const STANDARD_URLAUB = 30;

/* ---------- Zustand ---------- */

export const state = {
  daten: null,
};

const listener = new Set();

export function abonnieren(fn) {
  listener.add(fn);
  return () => listener.delete(fn);
}

function benachrichtigen() {
  for (const fn of listener) fn(state.daten);
}

/** Nach jeder Datenaenderung aufrufen: rendert neu und stoesst Autosave an. */
export function aendern(fn) {
  if (typeof fn === 'function') fn(state.daten);
  state.daten.meta.geaendertAm = zeitstempel();
  benachrichtigen();
  planeSpeichern();
}

/* ---------- Neuanlage & Migration ---------- */

export function neueDaten(name) {
  const jahr = Number(heuteISO().slice(0, 4));
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      name: name || 'Ohne Namen',
      erstelltAm: zeitstempel(),
      geaendertAm: zeitstempel(),
      letztesBackup: null,
      version: 0,
    },
    einstellungen: { ...STANDARD_EINSTELLUNGEN },
    wochenplaene: [{ id: uid('plan'), gueltigAb: null, ...STANDARD_WOCHENPLAN }],
    // Das laufende Jahr ist immer schon da – sonst steht der Nutzer beim ersten
    // Urlaubstag vor einer leeren Tabelle und weiss nicht, dass er ein Jahr
    // anlegen muesste.
    jahre: { [jahr]: { anspruch: STANDARD_URLAUB, uebertrag: 0, genommenVorher: 0 } },
    tage: {},
    protokoll: [],
  };
}

/**
 * Fuellt fehlende Felder auf und hebt aeltere Dateien auf die aktuelle
 * Version. Neue Migrationsschritte werden unten angehaengt, nie eingefuegt –
 * die Reihenfolge ist der Vertrag mit allen bereits gespeicherten Dateien.
 */
export function migrieren(daten) {
  if (!daten || typeof daten !== 'object') throw new Error('Ungültige Datei');

  const v = daten.schemaVersion ?? 0;
  if (v > SCHEMA_VERSION) {
    throw new Error(
      `Diese Datei wurde mit einer neueren App-Version erstellt (Schema ${v}). Bitte die App aktualisieren.`
    );
  }

  /* Schema 2: Der vor dem Erfassungsbeginn genommene Urlaub steckte bis dahin
     stillschweigend im Uebertrag – wer mit zwei Resttagen einstieg, trug „2"
     ein und verlor die Information, dass 28 Tage bereits weg waren. Jetzt gibt
     es dafuer ein eigenes Feld. Bestehende Dateien bekommen null, damit ihre
     bisher angezeigten Reste unveraendert bleiben; wer will, traegt Anspruch
     und genommenVorher nachtraeglich sauber ein. */
  if (v < 2) {
    for (const eintrag of Object.values(daten.jahre || {})) {
      if (eintrag && eintrag.genommenVorher === undefined) eintrag.genommenVorher = 0;
    }
    daten.schemaVersion = 2;
  }

  /* Schema 3: Team-Betrieb. meta.version zaehlt Schreibvorgaenge – der
     Server lehnt damit veraltete Schreibversuche ab, statt eine
     gleichzeitige Aenderung eines anderen Kontos zu verlieren. Protokoll-
     eintraege bekommen kuenftig wer, ohne dass alte Eintraege nachtraeglich
     einen Namen erfinden muessten – dort bleibt es einfach leer. */
  if (v < 3) {
    if (daten.meta && daten.meta.version === undefined) daten.meta.version = 0;
    daten.schemaVersion = 3;
  }

  /* Schema 4: Zeitabschnitte koennen ein Projekt tragen (intervall.projektId).
     Nichts zu tun – ein fehlendes projektId heisst schlicht „nicht gebucht".
     Der Schritt wird trotzdem gesetzt, damit die Datei ihre Version ehrlich
     angibt. */
  if (v < 4) {
    daten.schemaVersion = 4;
  }

  const basis = neueDaten(daten.meta?.name);
  const zusammen = {
    ...basis,
    ...daten,
    meta: { ...basis.meta, ...(daten.meta || {}) },
    einstellungen: { ...STANDARD_EINSTELLUNGEN, ...(daten.einstellungen || {}) },
  };
  for (const key of ['protokoll', 'wochenplaene']) {
    if (!Array.isArray(zusammen[key])) zusammen[key] = [];
  }
  // tage und jahre sind Objekte, keine Listen – die Schleife oben greift dort nicht
  for (const key of ['tage', 'jahre']) {
    if (!zusammen[key] || typeof zusammen[key] !== 'object' || Array.isArray(zusammen[key])) {
      zusammen[key] = {};
    }
  }
  // Ohne einen einzigen Wochenplan haette kein Tag ein Soll und das Konto
  // stuende stumm bei null. Lieber die Vorgabe als gar nichts.
  if (!zusammen.wochenplaene.length) {
    zusammen.wochenplaene = [{ id: uid('plan'), gueltigAb: null, ...STANDARD_WOCHENPLAN }];
  }
  zusammen.schemaVersion = SCHEMA_VERSION;
  return zusammen;
}

export function laden(daten) {
  state.daten = migrieren(daten);
  benachrichtigen();
  return state.daten;
}

/**
 * Wird aufgerufen, wenn der Server einen Schreibvorgang mit veralteter
 * Version abgelehnt hat (jemand anders – meist der Admin – hat zwischenzeitlich
 * gespeichert). Übernimmt dessen Stand; der eigene, noch nicht gespeicherte
 * letzte Tastendruck geht dabei verloren, nicht aber die Korrektur des
 * anderen – umgekehrt wäre der Schaden größer.
 */
export function serverStandUebernehmen(daten) {
  if (!daten) return;
  state.daten = migrieren(daten);
  benachrichtigen();
}

/**
 * Nach jedem erfolgreichen Speichern aufgerufen: uebernimmt die vom Server
 * vergebene meta.version (und was der Server sonst beim Schreiben setzt,
 * z. B. letztesBackup) in den lokalen Stand.
 *
 * Bewusst *kein* aendern() – das wuerde seinerseits wieder planeSpeichern()
 * anstossen und liefe der Sache hinterher. Ohne diesen Schritt bliebe die
 * lokale Version auf dem alten Stand stehen; der naechste Speicherversuch
 * traete damit erneut mit einer bereits ueberholten Version an und wuerde
 * vom Server als Konflikt abgelehnt – bei jedem zweiten Speichern einer
 * Sitzung, nicht nur gelegentlich.
 */
export function serverMetaUebernehmen(meta) {
  if (!state.daten || !meta) return;
  state.daten.meta = { ...state.daten.meta, ...meta };
}

/* ---------- Wochenplaene ---------- */

/**
 * Neuer Wochenplan ab einem Stichtag. Vorbelegt wird mit dem bis dahin
 * geltenden Plan: ein Wechsel aendert selten alles, meist nur zwei Zahlen.
 */
export function neuerWochenplan(gueltigAb, vorlage) {
  const quelle = vorlage || STANDARD_WOCHENPLAN;
  return {
    id: uid('plan'),
    gueltigAb: gueltigAb || null,
    bezeichnung: 'Neues Zeitmodell',
    stunden: [...(quelle.stunden || STANDARD_WOCHENPLAN.stunden)],
    vorgabeVon: quelle.vorgabeVon ?? STANDARD_WOCHENPLAN.vorgabeVon,
    vorgabeBis: quelle.vorgabeBis ?? STANDARD_WOCHENPLAN.vorgabeBis,
    vorgabePauseMin: quelle.vorgabePauseMin ?? STANDARD_WOCHENPLAN.vorgabePauseMin,
  };
}

export const planMit = (id) => state.daten.wochenplaene.find((p) => p.id === id);

/* ---------- Jahre ---------- */

export function jahrHolen(jahr) {
  const key = String(jahr);
  if (!state.daten.jahre[key]) {
    state.daten.jahre[key] = { anspruch: STANDARD_URLAUB, uebertrag: null, genommenVorher: 0 };
  }
  return state.daten.jahre[key];
}

/* ---------- Tage ---------- */

export function neuerTag() {
  return { art: null, intervalle: [], pauseMin: null, notiz: '' };
}

/**
 * Den Eintrag zu einem Datum holen und dabei anlegen, falls es ihn noch nicht
 * gibt. Aufrufer raeumen anschliessend mit tagAufraeumen() hinter sich her,
 * sonst bleibt fuer jeden einmal angetippten Tag eine leere Huelle stehen.
 */
export function tagHolen(iso) {
  if (!state.daten.tage[iso]) state.daten.tage[iso] = neuerTag();
  return state.daten.tage[iso];
}

export const tagLesen = (iso) => state.daten.tage[iso] || null;

/** true, wenn an dem Eintrag nichts mehr haengt, was der Rede wert waere. */
export function tagIstLeer(tag) {
  if (!tag) return true;
  const hatZeiten = (tag.intervalle || []).some((iv) => iv && (iv.von || iv.bis));
  return !tag.art && !hatZeiten && !tag.pauseMin && !(tag.notiz || '').trim();
}

/** Leergeraeumte Eintraege wieder entfernen, damit die Datei nicht zuwaechst. */
export function tagAufraeumen(iso) {
  const tag = state.daten.tage[iso];
  if (tag && tagIstLeer(tag)) delete state.daten.tage[iso];
}

/** Die Vorgabezeiten eines Plans auf einen Tag uebertragen. */
export function vorgabeUebernehmen(iso, plan) {
  if (!plan) return;
  const tag = tagHolen(iso);
  tag.art = tag.art || 'arbeit';
  tag.intervalle = [{ von: plan.vorgabeVon || '', bis: plan.vorgabeBis || '' }];
  tag.pauseMin = plan.vorgabePauseMin ?? 0;
}

/* ---------- Aenderungsprotokoll ----------
   felder.js ruft protokollieren() bei jeder Feldaenderung auf. */

export function protokollieren(bezugId, was, alt, neu) {
  state.daten.protokoll.push({
    id: uid('log'),
    zeit: zeitstempel(),
    bezugId,
    was,
    alt: alt ?? null,
    neu: neu ?? null,
    // Wer angemeldet ist, nicht wessen Konto gerade betrachtet wird – so
    // steht bei einer Korrektur durch den Admin dessen Name im Protokoll
    // des Mitarbeiters, nicht der Name des Mitarbeiters selbst.
    wer: wer(),
  });
  if (state.daten.protokoll.length > 2000) state.daten.protokoll.splice(0, 500);
}

/**
 * Protokolleintraege zu einem Bezug, neueste zuerst.
 * Vor dem Sortieren wird umgedreht, damit bei gleichem Zeitstempel der
 * zuletzt eingefuegte Eintrag oben steht – Array.sort ist stabil.
 */
export function protokollEintraege(bezugId) {
  return state.daten.protokoll
    .filter((p) => !bezugId || p.bezugId === bezugId)
    .reverse()
    .sort((a, b) => String(b.zeit).localeCompare(String(a.zeit)));
}
