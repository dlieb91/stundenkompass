/* Kunden und Projekte im Browser: geladener Stand, Merken zuletzt genutzter
   Projekte fuer die Auswahl in der Erfassung.

   Die Reihenfolge „zuletzt genutzt zuerst" gehoert in den localStorage,
   nicht in die Datei – sie beschreibt die Sicht, nicht die Zahlen.
*/

import * as api from './api.js';

const ZULETZT_KEY = 'stundenkompass-zuletzt-projekte';
const ZULETZT_MAX = 8;

export const stammdaten = {
  daten: null, // { schemaVersion, meta, projektpflicht, kunden, projekte }
};

export async function stammdatenLaden() {
  const { stammdaten: geladen } = await api.stammdaten();
  stammdaten.daten = geladen;
  return geladen;
}

export const projektpflicht = () => !!stammdaten.daten?.projektpflicht;

export const kundeName = (kundeId) =>
  stammdaten.daten?.kunden?.find((k) => k.id === kundeId)?.name || '';

export const projektMit = (id) =>
  stammdaten.daten?.projekte?.find((p) => p.id === id) || null;

export const aktiveKunden = () => (stammdaten.daten?.kunden || []).filter((k) => k.aktiv);
export const aktiveProjekte = () => (stammdaten.daten?.projekte || []).filter((p) => p.aktiv);

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
