/* Kunden und Projekte – betriebsweite Stammdaten, nicht je Mitarbeiter.

   Aufbau von daten/stammdaten.json:

     projektpflicht  schaltet die ganze Funktion frei. Aus (Standard): keine
                     Projektspalte, keine Beanstandung – ein Betrieb ohne
                     Projekte merkt von alldem nichts.
     kunden[]         { id, nummer, name, notiz, aktiv }
     projekte[]       { id, code, name, kundeId, details, aktiv }

   Ein Projektcode ist ein eigenes, aenderbares Feld, nicht die Identitaet:
   gebucht wird auf die unveraenderliche id. Wer einen Code spaeter
   umbenennt, entwertet damit keine einzige alte Buchung.

   Archiviert wird, nicht geloescht – wie schon bei den Konten. Ein Kunde
   mit noch aktiven Projekten laesst sich nicht archivieren.
*/

const ablage = require('./ablage');

function STANDARD() {
  return {
    schemaVersion: 1,
    meta: { geaendertAm: null, version: 0 },
    projektpflicht: false,
    kunden: [],
    projekte: [],
  };
}

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function fehlerMit(status, text) {
  const f = new Error(text);
  f.status = status;
  return f;
}

/** Liest die Stammdaten; gibt eine leere Struktur zurueck, wenn noch nie gespeichert wurde. */
async function lesen() {
  const daten = await ablage.stammdatenLesen();
  return daten || STANDARD();
}

/**
 * Liest den aktuellen Stand, laesst fn daran arbeiten und schreibt zurueck.
 * fn bekommt eine tiefe Kopie – Nebenwirkungen auf einer geteilten
 * Referenz koennten sonst einen fehlgeschlagenen Schreibversuch trotzdem
 * im Speicher hinterlassen.
 */
async function aendern(fn) {
  const aktuell = await lesen();
  const version = aktuell.meta.version ?? 0;
  const kopie = JSON.parse(JSON.stringify(aktuell));
  const ergebnis = fn(kopie);
  await ablage.stammdatenSchreiben(kopie, version);
  return ergebnis;
}

/* ---------- Kunden ---------- */

async function kundeAnlegen({ nummer, name, notiz }) {
  const n = String(name ?? '').trim();
  if (!n) throw fehlerMit(400, 'Name ist erforderlich.');
  const eintrag = {
    id: uid('kd'), nummer: String(nummer ?? '').trim(), name: n,
    notiz: String(notiz ?? '').trim(), aktiv: true,
  };
  await aendern((d) => { d.kunden.push(eintrag); });
  return eintrag;
}

async function kundeAendern(id, { nummer, name, notiz }) {
  await aendern((d) => {
    const k = d.kunden.find((x) => x.id === id);
    if (!k) throw fehlerMit(404, 'Kunde nicht gefunden.');
    if (name != null) {
      const n = String(name).trim();
      if (!n) throw fehlerMit(400, 'Name ist erforderlich.');
      k.name = n;
    }
    if (nummer != null) k.nummer = String(nummer).trim();
    if (notiz != null) k.notiz = String(notiz).trim();
  });
}

/** Archivieren scheitert, solange noch aktive Projekte auf den Kunden zeigen. */
async function kundeAktivSetzen(id, aktiv) {
  await aendern((d) => {
    const k = d.kunden.find((x) => x.id === id);
    if (!k) throw fehlerMit(404, 'Kunde nicht gefunden.');
    if (!aktiv) {
      const betroffene = d.projekte.filter((p) => p.kundeId === id && p.aktiv);
      if (betroffene.length) {
        const namen = betroffene.map((p) => p.code || p.name).join(', ');
        throw fehlerMit(409, `Noch aktive Projekte auf diesen Kunden: ${namen}. Erst diese archivieren.`);
      }
    }
    k.aktiv = !!aktiv;
  });
}

/* ---------- Projekte ---------- */

function codeKollision(projekte, code, ausser) {
  const c = code.toLowerCase();
  return projekte.some((p) => p.id !== ausser && p.aktiv && p.code.toLowerCase() === c);
}

async function projektAnlegen({ code, name, kundeId, details }) {
  const c = String(code ?? '').trim();
  const n = String(name ?? '').trim();
  if (!c || !n) throw fehlerMit(400, 'Projektcode und Name sind erforderlich.');
  const eintrag = {
    id: uid('pr'), code: c, name: n,
    kundeId: kundeId || null, details: String(details ?? '').trim(), aktiv: true,
  };
  await aendern((d) => {
    if (kundeId && !d.kunden.some((k) => k.id === kundeId)) throw fehlerMit(400, 'Kunde nicht gefunden.');
    if (codeKollision(d.projekte, c, null)) throw fehlerMit(409, `Der Projektcode „${c}" ist bereits vergeben.`);
    d.projekte.push(eintrag);
  });
  return eintrag;
}

async function projektAendern(id, { code, name, kundeId, details }) {
  await aendern((d) => {
    const p = d.projekte.find((x) => x.id === id);
    if (!p) throw fehlerMit(404, 'Projekt nicht gefunden.');
    if (code != null) {
      const c = String(code).trim();
      if (!c) throw fehlerMit(400, 'Projektcode ist erforderlich.');
      if (codeKollision(d.projekte, c, id)) throw fehlerMit(409, `Der Projektcode „${c}" ist bereits vergeben.`);
      p.code = c;
    }
    if (name != null) {
      const n = String(name).trim();
      if (!n) throw fehlerMit(400, 'Name ist erforderlich.');
      p.name = n;
    }
    if (kundeId !== undefined) {
      if (kundeId && !d.kunden.some((k) => k.id === kundeId)) throw fehlerMit(400, 'Kunde nicht gefunden.');
      p.kundeId = kundeId || null;
    }
    if (details != null) p.details = String(details).trim();
  });
}

async function projektAktivSetzen(id, aktiv) {
  await aendern((d) => {
    const p = d.projekte.find((x) => x.id === id);
    if (!p) throw fehlerMit(404, 'Projekt nicht gefunden.');
    p.aktiv = !!aktiv;
  });
}

async function projektpflichtSetzen(an) {
  await aendern((d) => { d.projektpflicht = !!an; });
}

module.exports = {
  lesen,
  kundeAnlegen, kundeAendern, kundeAktivSetzen,
  projektAnlegen, projektAendern, projektAktivSetzen,
  projektpflichtSetzen,
};
