/* Ablage „Dropbox" – lokal zuerst, Dropbox als Ziel.

   Die App schreibt immer in den Geraetespeicher, auch wenn Netz da ist.
   Der Abgleich laeuft daneben. Nur so funktioniert Offline-Betrieb ohne
   zweiten Codepfad: Was offline erfasst wurde, liegt am selben Ort wie
   alles andere und geht beim naechsten Abgleich mit.

   Abgeglichen wird genau eine Datei, die stunden.json. Der Abgleich steht
   und faellt mit zwei Zahlen:

     meta.stand   zaehlt in der Datei mit jeder Aenderung hoch (store.js)
     rev          Dropbox' eigene Kennung des Dateistands

   Gemerkt wird, welches Paar beim letzten erfolgreichen Abgleich galt.
   Daraus folgt eindeutig, wer sich seitdem geruehrt hat – ohne Uhren zu
   vergleichen, die auf zwei Geraeten ohnehin auseinanderlaufen.

   Widersprechen sich beide Seiten, wird **nicht** zusammengefuehrt. Zwei
   Fassungen eines Stundenkontos automatisch zu verschmelzen waere geraten,
   nicht gerechnet. Stattdessen entscheidet der Nutzer, und die unterlegene
   Fassung bleibt als Sicherung erhalten.

   Dieselbe Bauart wie in ImmoPortfolio, dort mit Bildern und Dokumenten. */

import { kvGet, kvSet, kvDel } from '../db.js';
import { dateiablage } from './dateiablage.js';
import * as api from './dropboxApi.js';

const ablage = dateiablage('dropbox/');
const DATEI = 'stunden.json';
const PFAD = '/' + DATEI;

export const kennung = 'dropbox';
export const name = 'Dropbox';

export function verfuegbar() {
  return typeof indexedDB !== 'undefined' && typeof fetch === 'function';
}

/* ---------- Auswahl und Rechte ---------- */

export async function waehlen() {
  return { kennung };
}

export async function rechtePruefen() {
  return api.angemeldet();
}

export async function uebernehmen() {
  return (await api.kontoName()) || 'Dropbox';
}

export async function merken() {
  await kvSet('dropboxAktiv', true);
}

export async function gemerkt() {
  if (!(await kvGet('dropboxAktiv'))) return null;
  if (!(await api.angemeldet())) return null;
  return { ziel: { kennung }, name: (await api.kontoName()) || 'Dropbox' };
}

export async function vergessen() {
  await kvDel('dropboxAktiv');
}

/** Trennt die Verbindung und raeumt den Zwischenspeicher. Die Datei in Dropbox bleibt. */
export async function abmeldenUndLeeren() {
  await ablage.leeren();
  await api.abmelden();
  await vergessen();
  await kvDel('dropboxRev');
  await kvDel('dropboxStand');
}

/* ---------- Rueckwand: immer der lokale Zwischenspeicher ---------- */

export const lesen = (pfad) => ablage.lesen(pfad);
export const schreiben = (pfad, inhalt) => ablage.schreiben(pfad, inhalt);
export const loeschen = (pfad) => ablage.loeschen(pfad);
export const auflisten = (ordnerPfad) => ablage.auflisten(ordnerPfad);

/* ---------- Abgleich ---------- */

const merker = {
  rev: () => kvGet('dropboxRev'),
  stand: () => kvGet('dropboxStand'),
  setzen: async (rev, stand) => { await kvSet('dropboxRev', rev); await kvSet('dropboxStand', stand); },
};

async function standVon() {
  const blob = await ablage.lesen(DATEI);
  if (!blob) return null;
  try { return JSON.parse(await blob.text()); } catch { return null; }
}

/** Zusammenfassung einer Fassung, damit der Konfliktdialog etwas zu zeigen hat. */
function steckbrief(daten) {
  const tage = Object.keys(daten?.tage || {}).sort();
  return {
    stand: daten?.meta?.stand ?? 0,
    geaendertAm: daten?.meta?.geaendertAm || null,
    geraet: daten?.meta?.geraet || null,
    tage: tage.length,
    letzterTag: tage[tage.length - 1] || null,
  };
}

function stempel() {
  const n = new Date();
  const z = (x) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${z(n.getMonth() + 1)}-${z(n.getDate())}-${z(n.getHours())}-${z(n.getMinutes())}`;
}

/**
 * Erster Griff nach dem Verbinden: Liegt drueben schon eine stunden.json,
 * wird sie in den Zwischenspeicher geholt – sonst legte jedes neue Geraet
 * einen zweiten, leeren Stand an. Liefert true, wenn etwas geholt wurde.
 */
export async function erstbezug() {
  if (await ablage.lesen(DATEI)) return false;
  const fern = await api.datenLaden(PFAD);
  if (!fern) return false;
  const text = await fern.blob.text();
  await ablage.schreiben(DATEI, text);
  let stand = 0;
  try { stand = JSON.parse(text)?.meta?.stand ?? 0; } catch { /* egal */ }
  await merker.setzen(fern.rev, stand);
  return true;
}

let laeuft = null;

/**
 * Gleicht ab. Liefert:
 *   { art: 'nichts' | 'hochgeladen' | 'geholt' | 'erstanlage', ... }
 *   { art: 'konflikt', hier, dort, fremdRev, fremdDaten } – der Aufrufer muss fragen
 *
 * Mehrfachaufrufe teilen sich denselben Lauf; parallele Abgleiche waeren
 * ein sicherer Weg, genau den Konflikt zu erzeugen, den sie verhindern sollen.
 */
export function abgleichen() {
  if (laeuft) return laeuft;
  laeuft = abgleichLauf().finally(() => { laeuft = null; });
  return laeuft;
}

async function abgleichLauf() {
  const hier = await standVon();
  if (!hier) throw new Error('Lokal sind noch keine Zeitdaten vorhanden.');

  const fern = await api.datenLaden(PFAD);
  const gemerkteRev = await merker.rev();
  const gemerkterStand = await merker.stand();

  if (!fern) {
    const rev = await api.datenSchreiben(PFAD, JSON.stringify(hier, null, 2), null);
    await merker.setzen(rev, hier.meta.stand);
    return { art: 'erstanlage' };
  }

  const fremdText = await fern.blob.text();
  const fremd = JSON.parse(fremdText);
  const hierGeaendert = hier.meta.stand !== gemerkterStand;
  const dortGeaendert = fern.rev !== gemerkteRev;

  if (!hierGeaendert && !dortGeaendert) return { art: 'nichts' };

  if (hierGeaendert && !dortGeaendert) {
    await hochladen(hier, fern.rev);
    return { art: 'hochgeladen', stand: hier.meta.stand };
  }

  if (!hierGeaendert && dortGeaendert) {
    await uebernehmenVonFern(fremd, fern.rev);
    return { art: 'geholt', daten: fremd, stand: fremd.meta?.stand };
  }

  /* Beide Seiten haben sich bewegt – hier endet das, was die App allein
     entscheiden darf. Die fremde Fassung wird als Sicherung abgelegt,
     damit sie in keinem Fall verloren geht. */
  await ablage.schreiben(`backups/konflikt-${stempel()}.json`, fremdText);
  return {
    art: 'konflikt',
    hier: steckbrief(hier),
    dort: steckbrief(fremd),
    fremdRev: fern.rev,
    fremdDaten: fremd,
  };
}

async function hochladen(daten, rev) {
  const neu = await api.datenSchreiben(PFAD, JSON.stringify(daten, null, 2), rev);
  await merker.setzen(neu, daten.meta.stand);
  return neu;
}

async function uebernehmenVonFern(fremd, rev) {
  /* Den eigenen Stand vorher sichern – er wird gleich ersetzt. */
  const alt = await ablage.lesen(DATEI);
  if (alt) await ablage.schreiben(`backups/vor-abgleich-${stempel()}.json`, await alt.text());
  await ablage.schreiben(DATEI, JSON.stringify(fremd, null, 2));
  await merker.setzen(rev, fremd.meta?.stand ?? 0);
}

/* ---------- Konflikt aufloesen ---------- */

/** „Mein Stand gewinnt" – ueberschreibt die fremde Fassung. */
export async function konfliktHierBehalten(fremdRev) {
  const hier = await standVon();
  await hochladen(hier, fremdRev);
  return { art: 'hochgeladen', stand: hier.meta.stand };
}

/** „Dropbox gewinnt" – holt die fremde Fassung, sichert die eigene. */
export async function konfliktDortBehalten(fremdDaten, fremdRev) {
  await uebernehmenVonFern(fremdDaten, fremdRev);
  return { art: 'geholt', daten: fremdDaten, stand: fremdDaten.meta?.stand };
}

/* ---------- Status fuer die Oberflaeche ---------- */

export async function abgleichStatus() {
  const daten = await standVon();
  return {
    angemeldet: await api.angemeldet(),
    konto: await api.kontoName(),
    offeneAenderungen: daten ? daten.meta?.stand !== (await merker.stand()) : false,
    online: navigator.onLine,
  };
}
