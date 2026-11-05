/* Kunden und Projekte im Browser: geladener Stand, Aenderungen, Merken
   zuletzt genutzter Projekte fuer die Auswahl in der Erfassung.

   Wo sie liegen, haengt an der Betriebsart (betrieb.js):

     team     betriebsweit auf dem Server (server/stammdaten.js). Lesen
              duerfen alle, Schreiben nur der Admin – der Server prueft mit.
     einzel   in der eigenen stunden.json unter daten.stammdaten. Damit
              gehen sie mit jedem Export und jedem Dropbox-Abgleich mit,
              ohne zweite Datei.

   Die Regeln – Code eindeutig unter den aktiven Projekten, kein Archivieren
   eines Kunden mit aktiven Projekten – stehen fuer den Einzelplatz hier noch
   einmal, mit denselben Meldungen wie auf dem Server.

   Die Reihenfolge „zuletzt genutzt zuerst" gehoert in den localStorage,
   nicht in die Datei – sie beschreibt die Sicht, nicht die Zahlen.
*/

import * as api from './api.js';
import { istEinzel } from './betrieb.js';
import { state, aendern } from './store.js';
import { uid } from './util.js';

const ZULETZT_KEY = 'stundenkompass-zuletzt-projekte';
const ZULETZT_MAX = 8;

export const stammdaten = {
  daten: null, // nur Team: { schemaVersion, meta, projektpflicht, kunden, projekte }
};

const LEER = () => ({ projektpflicht: false, kunden: [], projekte: [] });

/** Einzelplatz: die Stammdaten in der eigenen Datei, bei Bedarf angelegt. */
function lokal() {
  const d = state.daten;
  if (!d) return LEER();
  if (!d.stammdaten || typeof d.stammdaten !== 'object') d.stammdaten = LEER();
  for (const key of ['kunden', 'projekte']) {
    if (!Array.isArray(d.stammdaten[key])) d.stammdaten[key] = [];
  }
  return d.stammdaten;
}

/** Der aktuell gueltige Stand – im Einzelplatz immer frisch aus state.daten,
    denn ein Dropbox-Abgleich kann die ganze Datei austauschen. */
export const aktuell = () => (istEinzel() ? lokal() : stammdaten.daten);

export async function stammdatenLaden() {
  if (istEinzel()) return lokal();
  const { stammdaten: geladen } = await api.stammdaten();
  stammdaten.daten = geladen;
  return geladen;
}

export const projektpflicht = () => !!aktuell()?.projektpflicht;

export const kundeName = (kundeId) =>
  aktuell()?.kunden?.find((k) => k.id === kundeId)?.name || '';

export const projektMit = (id) =>
  aktuell()?.projekte?.find((p) => p.id === id) || null;

export const aktiveKunden = () => (aktuell()?.kunden || []).filter((k) => k.aktiv);
export const aktiveProjekte = () => (aktuell()?.projekte || []).filter((p) => p.aktiv);

/* ---------- Aendern ---------- */

/** Im Einzelplatz: fn an einer Kopie pruefen, erst bei Erfolg uebernehmen –
    eine abgelehnte Aenderung soll keine halben Spuren hinterlassen. */
function lokalAendern(fn) {
  const kopie = JSON.parse(JSON.stringify(lokal()));
  const ergebnis = fn(kopie);
  aendern((d) => { d.stammdaten = kopie; });
  return ergebnis;
}

const pflicht = (wert, text) => {
  const s = String(wert ?? '').trim();
  if (!s) throw new Error(text);
  return s;
};

function codeKollision(projekte, code, ausser) {
  const c = code.toLowerCase();
  return projekte.some((p) => p.id !== ausser && p.aktiv && String(p.code).toLowerCase() === c);
}

export async function kundeAnlegen({ nummer, name, notiz }) {
  if (!istEinzel()) return api.kundeAnlegen({ nummer, name, notiz });
  const eintrag = {
    id: uid('kd'), nummer: String(nummer ?? '').trim(), name: pflicht(name, 'Name ist erforderlich.'),
    notiz: String(notiz ?? '').trim(), aktiv: true,
  };
  lokalAendern((d) => { d.kunden.push(eintrag); });
  return { kunde: eintrag };
}

export async function kundeAendern(id, { nummer, name, notiz }) {
  if (!istEinzel()) return api.kundeAendern(id, { nummer, name, notiz });
  lokalAendern((d) => {
    const k = d.kunden.find((x) => x.id === id);
    if (!k) throw new Error('Kunde nicht gefunden.');
    if (name != null) k.name = pflicht(name, 'Name ist erforderlich.');
    if (nummer != null) k.nummer = String(nummer).trim();
    if (notiz != null) k.notiz = String(notiz).trim();
  });
}

export async function kundeAktivSetzen(id, aktiv) {
  if (!istEinzel()) return api.kundeAktivSetzen(id, aktiv);
  lokalAendern((d) => {
    const k = d.kunden.find((x) => x.id === id);
    if (!k) throw new Error('Kunde nicht gefunden.');
    if (!aktiv) {
      const betroffene = d.projekte.filter((p) => p.kundeId === id && p.aktiv);
      if (betroffene.length) {
        const namen = betroffene.map((p) => p.code || p.name).join(', ');
        throw new Error(`Noch aktive Projekte auf diesen Kunden: ${namen}. Erst diese archivieren.`);
      }
    }
    k.aktiv = !!aktiv;
  });
}

export async function projektAnlegen({ code, name, kundeId, details }) {
  if (!istEinzel()) return api.projektAnlegen({ code, name, kundeId, details });
  const c = String(code ?? '').trim();
  const n = String(name ?? '').trim();
  if (!c || !n) throw new Error('Projektcode und Name sind erforderlich.');
  const eintrag = {
    id: uid('pr'), code: c, name: n,
    kundeId: kundeId || null, details: String(details ?? '').trim(), aktiv: true,
  };
  lokalAendern((d) => {
    if (kundeId && !d.kunden.some((k) => k.id === kundeId)) throw new Error('Kunde nicht gefunden.');
    if (codeKollision(d.projekte, c, null)) throw new Error(`Der Projektcode „${c}" ist bereits vergeben.`);
    d.projekte.push(eintrag);
  });
  return { projekt: eintrag };
}

export async function projektAendern(id, { code, name, kundeId, details }) {
  if (!istEinzel()) return api.projektAendern(id, { code, name, kundeId, details });
  lokalAendern((d) => {
    const p = d.projekte.find((x) => x.id === id);
    if (!p) throw new Error('Projekt nicht gefunden.');
    if (code != null) {
      const c = pflicht(code, 'Projektcode ist erforderlich.');
      if (codeKollision(d.projekte, c, id)) throw new Error(`Der Projektcode „${c}" ist bereits vergeben.`);
      p.code = c;
    }
    if (name != null) p.name = pflicht(name, 'Name ist erforderlich.');
    if (kundeId !== undefined) {
      if (kundeId && !d.kunden.some((k) => k.id === kundeId)) throw new Error('Kunde nicht gefunden.');
      p.kundeId = kundeId || null;
    }
    if (details != null) p.details = String(details).trim();
  });
}

export async function projektAktivSetzen(id, aktiv) {
  if (!istEinzel()) return api.projektAktivSetzen(id, aktiv);
  lokalAendern((d) => {
    const p = d.projekte.find((x) => x.id === id);
    if (!p) throw new Error('Projekt nicht gefunden.');
    p.aktiv = !!aktiv;
  });
}

export async function projektpflichtSetzen(an) {
  if (!istEinzel()) return api.projektpflichtSetzen(an);
  lokalAendern((d) => { d.projektpflicht = !!an; });
}

/* ---------- Zuletzt genutzt ---------- */

function zuletztListe() {
  try { return JSON.parse(localStorage.getItem(ZULETZT_KEY)) || []; } catch { return []; }
}

/** Merkt sich ein Projekt als zuletzt genutzt – vorne einreihen, Dubletten entfernen. */
export function projektGenutzt(projektId) {
  if (!projektId) return;
  const liste = [projektId, ...zuletztListe().filter((id) => id !== projektId)].slice(0, ZULETZT_MAX);
  try { localStorage.setItem(ZULETZT_KEY, JSON.stringify(liste)); } catch { /* egal, nur Komfort */ }
}

/**
 * Aktive Projekte fuer eine Auswahl in der Erfassung: zuletzt selbst
 * genutzte zuerst, der Rest alphabetisch nach Code/Name.
 */
export function projekteFuerAuswahl() {
  const aktive = aktiveProjekte();
  const zuletzt = zuletztListe().filter((id) => aktive.some((p) => p.id === id));
  const rest = aktive
    .filter((p) => !zuletzt.includes(p.id))
    .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, 'de'));
  const geordnet = [...zuletzt.map((id) => aktive.find((p) => p.id === id)), ...rest];
  return geordnet.map((p) => ({
    wert: p.id,
    text: p.code ? `${p.code} – ${p.name}` : p.name,
  }));
}
