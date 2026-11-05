/* Speicherschicht – eine Oberflaeche, zwei Betriebsarten (siehe betrieb.js).

   Nach aussen gleich, ganz gleich wohin geschrieben wird: datenquelle(),
   datenLesen(), planeSpeichern(), sofortSpeichern(), speicher.status,
   speicher.onStatus. Dadurch bleibt die Autosave-Choreografie in main.js
   und store.js fuer beide Betriebsarten dieselbe.

   TEAM – geschrieben wird ueber die Server-API.

     Status 'konflikt'   der Server hat den Schreibvorgang abgelehnt, weil
                          der Datensatz inzwischen anderswo geaendert wurde
                          (z. B. hat der Admin korrigiert). speicher.onKonflikt
                          bekommt den aktuellen Serverstand, damit store.js
                          ihn uebernehmen kann, statt ihn zu ueberschreiben.

     speicher.onGespeichert  nach jedem *erfolgreichen* Schreiben: der Server
                          vergibt beim Speichern die neue meta.version. Ohne
                          das lokal nachzuziehen, traete der naechste
                          Speicherversuch mit der alten Version an und wuerde
                          faelschlich als Konflikt abgelehnt.

   EINZELPLATZ – geschrieben wird in eine austauschbare Rueckwand aus
   js/speicher/ (dieselbe Bauart wie in ImmoPortfolio):

     ordner.js   File System Access API – Chrome/Edge, sichtbarer Ordner
     dropbox.js  Geraetespeicher plus Abgleich mit Dropbox
     lokal.js    IndexedDB – ueberall, auch auf iPhone und iPad

   Aufbau der Ablage:
     stunden.json   alle Zeitdaten
     backups/       taegliche Sicherung, die letzten 20
*/

import * as api from './api.js';
import { betrachteteId } from './sitzung.js';
import { istEinzel } from './betrieb.js';
import * as ordner from './speicher/ordner.js';
import * as lokal from './speicher/lokal.js';
import * as dropbox from './speicher/dropbox.js';
import { kvGet, kvSet, kvDel } from './db.js';

export const DATEI = 'stunden.json';
const MAX_BACKUPS = 20;
const AUTOSAVE_MS = 1500;

export const speicher = {
  status: 'idle',      // idle | dirty | saving | konflikt | error
  onStatus: null,       // Callback fuer die Statusanzeige
  onKonflikt: null,     // nur Team: (serverDaten) => void
  onGespeichert: null,  // nur Team: (serverMeta) => void
  aktiv: null,          // nur Einzelplatz: die gewaehlte Rueckwand
  kennung: '',          // nur Einzelplatz: 'ordner' | 'dropbox' | 'lokal'
  ablageName: '',       // nur Einzelplatz: Anzeigename der Ablage
};

function setStatus(s, detail) {
  speicher.status = s;
  if (speicher.onStatus) speicher.onStatus(s, detail);
}

let timer = null;
let laufend = null;
let erneut = false;
let holeDaten = null;

/** Registriert die Funktion, die den aktuellen Stand liefert. */
export function datenquelle(fn) {
  holeDaten = fn;
}

const bereit = () => holeDaten && (!istEinzel() || speicher.aktiv);

export function planeSpeichern() {
  if (!bereit()) return;
  setStatus('dirty');
  clearTimeout(timer);
  timer = setTimeout(() => { sofortSpeichern().catch(() => { /* Status zeigt den Fehler */ }); }, AUTOSAVE_MS);
}

/**
 * Datensatz laden. Team: eigener immer, fremder nur als Admin (der Server
 * prueft mit). Einzelplatz: die stunden.json der Ablage, kontoId zaehlt nicht.
 * Liefert null, wenn es noch keinen gibt.
 */
export async function datenLesen(kontoId) {
  if (istEinzel()) {
    const text = await rohLesen(DATEI);
    return text == null ? null : JSON.parse(text);
  }
  const { daten } = await api.datenLesen(kontoId);
  return daten;
}

export async function sofortSpeichern() {
  if (!bereit()) return;
  clearTimeout(timer);

  /* Laeuft bereits ein Schreibvorgang, wird nach dessen Ende noch einmal
     geschrieben. Ohne das ginge jede Aenderung verloren, die waehrend des
     Schreibens entsteht. */
  if (laufend) {
    erneut = true;
    return laufend;
  }

  laufend = (async () => {
    setStatus('saving');
    try {
      do {
        erneut = false;
        if (istEinzel()) {
          await einzelSchreiben(holeDaten());
        } else {
          const ok = await teamSchreiben(holeDaten());
          if (!ok) return;
        }
      } while (erneut);
      setStatus('idle', new Date());
    } catch (e) {
      console.error('Speichern fehlgeschlagen:', e);
      setStatus('error', e);
      throw e;
    } finally {
      laufend = null;
      erneut = false;
    }
  })();
  return laufend;
}

/* ---------- Team ---------- */

/** Liefert false, wenn der Vorgang mit einem bereits gemeldeten Zustand endete. */
async function teamSchreiben(daten) {
  try {
    const { daten: gespeichert } = await api.datenSchreiben(betrachteteId(), daten);
    if (gespeichert?.meta && speicher.onGespeichert) speicher.onGespeichert(gespeichert.meta);
    return true;
  } catch (e) {
    if (e.status === 409) {
      setStatus('konflikt', e.antwort?.daten);
      if (speicher.onKonflikt) speicher.onKonflikt(e.antwort?.daten);
      return false;
    }
    if (e.status === 401) {
      setStatus('error');
      return false; // api.js hat bereits das Abmelde-Ereignis ausgeloest
    }
    throw e;
  }
}

/* ---------- Einzelplatz: Ablage waehlen, pruefen, uebernehmen ---------- */

/** Alle Ablagen in der Reihenfolge, in der sie angeboten werden. */
export const ABLAGEN = [ordner, dropbox, lokal];

const ablageMit = (kennung) => ABLAGEN.find((a) => a.kennung === kennung) || null;

export const istUnterstuetzt = () => ABLAGEN.some((a) => a.verfuegbar());

export const verfuegbareAblagen = () =>
  ABLAGEN.filter((a) => a.verfuegbar()).map((a) => ({ kennung: a.kennung, name: a.name }));

/** Oeffnet die Auswahl der Ablage. Wirft AbortError, wenn abgebrochen wurde. */
export async function ablageWaehlen(kennung) {
  const a = ablageMit(kennung);
  if (!a) throw new Error('Unbekannte Ablage: ' + kennung);
  return { kennung, ziel: await a.waehlen() };
}

export async function rechtePruefen(auswahl, opts) {
  return ablageMit(auswahl.kennung).rechtePruefen(auswahl.ziel, opts);
}

/** Macht die Ablage scharf – ab hier schreibt die App dorthin. */
export async function ablageUebernehmen(auswahl) {
  const a = ablageMit(auswahl.kennung);
  speicher.aktiv = a;
  speicher.kennung = a.kennung;
  speicher.ablageName = await a.uebernehmen(auswahl.ziel);
}

export async function ablageMerken(auswahl) {
  await ablageMit(auswahl.kennung).merken(auswahl.ziel);
  await kvSet('ablage', auswahl.kennung);
}

/** Zuletzt benutzte Ablage, oder null. */
export async function gemerkteAblage() {
  const kennung = await kvGet('ablage');
  const a = kennung ? ablageMit(kennung) : null;
  if (!a || !a.verfuegbar()) return null;
  const g = await a.gemerkt();
  return g ? { kennung: a.kennung, ziel: g.ziel, name: g.name } : null;
}

/** Verbindung loesen – die Daten selbst bleiben, wo sie sind. */
export async function ablageVergessen() {
  for (const a of ABLAGEN) {
    try { await a.vergessen(); } catch { /* egal */ }
  }
  await kvDel('ablage');
  speicher.aktiv = null;
  speicher.kennung = '';
  speicher.ablageName = '';
}

/** Loescht den Geraetespeicher samt Daten – nur ueber den ausdruecklichen
    Weg in den Einstellungen, nie als Nebenwirkung. */
export async function geraetedatenLoeschen() {
  await lokal.alleDatenLoeschen();
  await ablageVergessen();
}

/** Dropbox trennen und den Zwischenspeicher dieses Geraets raeumen. */
export async function dropboxTrennen() {
  await dropbox.abmeldenUndLeeren();
  await ablageVergessen();
}

/* ---------- Einzelplatz: Abgleich (nur die Dropbox-Ablage kann das) ---------- */

export const abgleichMoeglich = () => istEinzel() && speicher.kennung === 'dropbox';

/**
 * Stoesst einen Abgleich an. Vorher wird alles Offene geschrieben – sonst
 * ginge die letzte Aenderung nicht mit und der naechste Lauf meldete
 * grundlos einen Konflikt.
 */
export async function abgleichen() {
  if (!abgleichMoeglich()) return { art: 'nichts' };
  if (speicher.status === 'dirty') await sofortSpeichern();
  return dropbox.abgleichen();
}

export async function erstbezug() {
  return speicher.kennung === 'dropbox' ? dropbox.erstbezug() : false;
}

export const konfliktHierBehalten = (rev) => dropbox.konfliktHierBehalten(rev);
export const konfliktDortBehalten = (daten, rev) => dropbox.konfliktDortBehalten(daten, rev);
export const abgleichStatus = () => dropbox.abgleichStatus();

/* ---------- Einzelplatz: Schreiben und Sicherungen ---------- */

function rueckwand() {
  if (!speicher.aktiv) throw new Error('Keine Ablage verbunden');
  return speicher.aktiv;
}

async function rohLesen(pfad) {
  const blob = await rueckwand().lesen(pfad);
  return blob == null ? null : blob.text();
}

async function einzelSchreiben(daten) {
  // Erst sichern, dann ueberschreiben – siehe backupWennFaellig.
  await backupWennFaellig(daten);
  await rueckwand().schreiben(DATEI, JSON.stringify(daten, null, 2));
}

function heute() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/**
 * Taegliche Sicherung – gesichert wird der Stand, der **vor** dieser
 * Aenderung in der Datei stand. Wuerde stattdessen der neue Stand
 * gesichert, enthielte die erste Sicherung des Tages die Aenderung bereits,
 * und genau die waere nicht mehr rueckgaengig zu machen.
 *
 * Der Name folgt der ersten Einzelplatz-Fassung (stundenkompass-…json),
 * damit deren Sicherungen in derselben Liste auftauchen.
 */
async function backupWennFaellig(daten) {
  const tag = heute();
  if (daten.meta?.letztesBackup === tag) return;

  const vorher = await rohLesen(DATEI);
  if (vorher != null) {
    const n = new Date();
    const stempel = `${tag}-${String(n.getHours()).padStart(2, '0')}-${String(n.getMinutes()).padStart(2, '0')}`;
    await rueckwand().schreiben(`backups/stundenkompass-${stempel}.json`, vorher);
    await backupsAufraeumen();
  }
  if (daten.meta) daten.meta.letztesBackup = tag;
}

async function backupsAufraeumen() {
  try {
    const namen = (await rueckwand().auflisten('backups'))
      .map((e) => e.name)
      .filter((n) => n.startsWith('stundenkompass-') && n.endsWith('.json'))
      .sort();
    for (const name of namen.slice(0, Math.max(0, namen.length - MAX_BACKUPS))) {
      await rueckwand().loeschen(`backups/${name}`);
    }
  } catch (e) {
    console.warn('Sicherungen aufräumen fehlgeschlagen:', e);
  }
}

/** Alle Sicherungen der Ablage, neueste zuerst – auch die aus Dropbox-Konflikten. */
export async function backupsAuflisten() {
  const liste = (await rueckwand().auflisten('backups')).filter((e) => e.name.endsWith('.json'));
  return liste.sort((a, b) => b.name.localeCompare(a.name));
}

export async function backupLesen(name) {
  return JSON.parse(await rohLesen(`backups/${name}`));
}

/* ---------- Als Datei sichern und zurueckholen (beide Betriebsarten) ---------- */

export function alsDateiSichern(daten, dateiname) {
  const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Liest eine zuvor gesicherte Datei ein. Wirft bei ungueltigem JSON. */
export async function ausDateiLesen(file) {
  return JSON.parse(await file.text());
}
