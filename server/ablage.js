/* Ablage – der Server besitzt den Datenordner.

     daten/
       team.json                    Konten, Rollen, Passwort-Hashes
       stammdaten.json               Kunden und Projekte, betriebsweit
       mitarbeiter/<id>.json        je Konto ein Datensatz im Schema der App
       backups/<datum>/<id>.json    eine Sicherung je Konto und Tag
       backups/<datum>/stammdaten.json

   Die Datei je Mitarbeiter hat genau das Format, das die App bisher als
   stunden.json in den gewaehlten Ordner geschrieben hat. Nur der Weg
   dorthin ist ein anderer – das Modell selbst bleibt unangetastet.

   Zwei Dinge muessen hier geloest werden, die es im Einzelplatzbetrieb
   nie gab:

   1. Halb geschriebene Dateien. Geschrieben wird immer zuerst in eine
      .tmp-Datei und danach umbenannt. Ein Absturz mitten im Schreiben
      hinterlaesst so nie einen zerstoerten Datensatz, sondern
      schlimmstenfalls eine ueberfluessige .tmp.

   2. Gleichzeitige Schreiber. Admin und Mitarbeiter koennen an derselben
      Datei sitzen. Je Pfad laeuft deshalb eine Kette, die Schreibvorgaenge
      nacheinander abarbeitet, und jeder Datensatz traegt in meta.version
      eine fortlaufende Zahl. Wer mit einer veralteten Version schreibt,
      wird abgewiesen, statt die Korrektur des anderen stillschweigend zu
      ueberschreiben.
*/

const fs = require('fs/promises');
const fss = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..', 'daten');
const MITARBEITER = path.join(WURZEL, 'mitarbeiter');
const BACKUPS = path.join(WURZEL, 'backups');
const TEAM = path.join(WURZEL, 'team.json');
const STAMMDATEN = path.join(WURZEL, 'stammdaten.json');

const MAX_SICHERUNGSTAGE = 20;

const heuteISO = () => new Date().toISOString().slice(0, 10);

/* ---------- Ordner ---------- */

async function ordnerAnlegen() {
  for (const o of [WURZEL, MITARBEITER, BACKUPS]) await fs.mkdir(o, { recursive: true });
}

function istEingerichtet() {
  return fss.existsSync(TEAM);
}

/* ---------- Schreibketten ----------
   Je Schluessel laeuft hoechstens ein Schreibvorgang. Ein Fehler bricht
   die Kette nicht ab – der naechste Aufrufer soll trotzdem drankommen. */

const ketten = new Map();

function inKette(schluessel, fn) {
  const vorher = ketten.get(schluessel) || Promise.resolve();
  const jetzt = vorher.then(fn, fn);
  ketten.set(schluessel, jetzt.then(() => {}, () => {}));
  return jetzt;
}

/* ---------- JSON lesen und schreiben ---------- */

async function jsonLesen(pfad) {
  try {
    return JSON.parse(await fs.readFile(pfad, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    if (e instanceof SyntaxError) throw new Error(`Datei ist kein gültiges JSON: ${pfad}`);
    throw e;
  }
}

async function jsonSchreiben(pfad, obj) {
  const tmp = pfad + '.tmp';
  await fs.mkdir(path.dirname(pfad), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await fs.rename(tmp, pfad);
}

/* ---------- team.json ---------- */

async function teamLesen() {
  return jsonLesen(TEAM);
}

/**
 * Liest team.json, laesst fn daran arbeiten und schreibt zurueck – alles
 * innerhalb der Kette, damit zwei gleichzeitige Aenderungen sich nicht
 * gegenseitig verschlucken. Gibt zurueck, was fn zurueckgibt.
 */
async function teamAendern(fn) {
  return inKette('team', async () => {
    const team = await teamLesen();
    if (!team) throw new Error('team.json fehlt – bitte Einrichten.bat ausführen.');
    const ergebnis = await fn(team);
    team.meta.geaendertAm = new Date().toISOString();
    await jsonSchreiben(TEAM, team);
    return ergebnis;
  });
}

async function teamAnlegen(team) {
  await ordnerAnlegen();
  await jsonSchreiben(TEAM, team);
}

/* ---------- Datensatz je Mitarbeiter ---------- */

const maPfad = (id) => path.join(MITARBEITER, id + '.json');

async function datensatzLesen(id) {
  return jsonLesen(maPfad(id));
}

/**
 * Schreibt den Datensatz eines Kontos.
 *
 * erwarteteVersion  die Version, auf der der Aufrufer gearbeitet hat.
 *                   Stimmt sie nicht mit der gespeicherten ueberein, wird
 *                   mit code 'VERSION' abgewiesen; der Fehler traegt den
 *                   aktuellen Stand in .aktuell, damit der Client ihn
 *                   ohne zweite Anfrage uebernehmen kann.
 *                   null heisst „ungeprueft" – nur fuer die Einrichtung.
 */
async function datensatzSchreiben(id, daten, erwarteteVersion) {
  return inKette('ma:' + id, async () => {
    const jetzt = await jsonLesen(maPfad(id));
    const ist = jetzt?.meta?.version ?? 0;

    if (erwarteteVersion != null && ist !== erwarteteVersion) {
      const fehler = new Error('Der Stand wurde inzwischen an anderer Stelle geändert.');
      fehler.code = 'VERSION';
      fehler.aktuell = jetzt;
      throw fehler;
    }

    const neu = { ...daten, meta: { ...(daten.meta || {}), version: ist + 1 } };
    await sicherungWennFaellig(id, neu);
    await jsonSchreiben(maPfad(id), neu);
    return neu;
  });
}

/** Alle Datensaetze auf einmal – fuer die Team-Uebersicht des Admins. */
async function alleDatensaetze(ids) {
  const raus = {};
  for (const id of ids) raus[id] = await datensatzLesen(id);
  return raus;
}

/* ---------- Stammdaten: Kunden und Projekte, betriebsweit ----------
   Dieselbe Versions- und Kettenlogik wie bei den Mitarbeiterdatensaetzen –
   zwei Admins koennen gleichzeitig an den Stammdaten sitzen. */

async function stammdatenLesen() {
  return jsonLesen(STAMMDATEN);
}

async function stammdatenSchreiben(daten, erwarteteVersion) {
  return inKette('stammdaten', async () => {
    const jetzt = await jsonLesen(STAMMDATEN);
    const ist = jetzt?.meta?.version ?? 0;

    if (erwarteteVersion != null && ist !== erwarteteVersion) {
      const fehler = new Error('Die Stammdaten wurden inzwischen an anderer Stelle geändert.');
      fehler.code = 'VERSION';
      fehler.aktuell = jetzt;
      throw fehler;
    }

    const neu = {
      ...daten,
      meta: { ...(daten.meta || {}), geaendertAm: new Date().toISOString(), version: ist + 1 },
    };
    // Wie bei den Mitarbeiterdatensaetzen: nur die erste Aenderung des Tages
    // legt eine Sicherung an, nicht jede einzelne.
    const heute = heuteISO();
    if (neu.meta.letztesBackup !== heute) {
      await sicherungAblegen('stammdaten', neu);
      neu.meta.letztesBackup = heute;
    }
    await jsonSchreiben(STAMMDATEN, neu);
    return neu;
  });
}

/* ---------- Sicherungen ----------
   Uebernommen aus der frueheren Client-Speicherschicht: einmal je Tag,
   die letzten 20 Tage bleiben erhalten. */

async function sicherungWennFaellig(id, daten) {
  const heute = heuteISO();
  if (daten.meta?.letztesBackup === heute) return;
  await jsonSchreiben(path.join(BACKUPS, heute, id + '.json'), daten);
  if (daten.meta) daten.meta.letztesBackup = heute;
  await sicherungenAufraeumen();
}

async function sicherungenAufraeumen() {
  try {
    const tage = (await fs.readdir(BACKUPS, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const tag of tage.slice(0, Math.max(0, tage.length - MAX_SICHERUNGSTAGE))) {
      await fs.rm(path.join(BACKUPS, tag), { recursive: true, force: true });
    }
  } catch (e) {
    console.warn('Sicherungen aufräumen fehlgeschlagen:', e.message);
  }
}

/** Sicherungen eines Kontos, neueste zuerst. */
async function sicherungenAuflisten(id) {
  let tage = [];
  try {
    tage = (await fs.readdir(BACKUPS, { withFileTypes: true }))
      .filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();
  } catch {
    return [];
  }
  const liste = [];
  for (const tag of tage) {
    try {
      const st = await fs.stat(path.join(BACKUPS, tag, id + '.json'));
      liste.push({ tag, groesse: st.size, geaendert: st.mtimeMs });
    } catch { /* an dem Tag gab es dieses Konto noch nicht */ }
  }
  return liste;
}

async function sicherungLesen(id, tag) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tag))) throw new Error('Ungültige Sicherung');
  return jsonLesen(path.join(BACKUPS, tag, id + '.json'));
}

/** Eine beliebige Datei zusaetzlich in die Sicherungen legen (Einrichtung). */
async function sicherungAblegen(name, obj) {
  await jsonSchreiben(path.join(BACKUPS, heuteISO(), name + '.json'), obj);
}

module.exports = {
  WURZEL, MITARBEITER, BACKUPS, TEAM, STAMMDATEN,
  heuteISO, ordnerAnlegen, istEingerichtet,
  jsonLesen, jsonSchreiben,
  teamLesen, teamAendern, teamAnlegen,
  datensatzLesen, datensatzSchreiben, alleDatensaetze,
  stammdatenLesen, stammdatenSchreiben,
  sicherungenAuflisten, sicherungLesen, sicherungAblegen,
};
