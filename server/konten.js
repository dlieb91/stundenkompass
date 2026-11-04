/* Konten – Anmeldedaten, Rollen, Passwoerter.

   team.json ist nie Teil einer Antwort an den Client: Hashes und Salts
   verlassen den Server nicht. Wer die Kontenliste braucht (Admin), bekommt
   sie ueber oeffentlichesKonto() gefiltert.

   Passwort-Hashing: PBKDF2-SHA256 ueber das eingebaute crypto-Modul, kein
   Fremdpaket. 210000 Iterationen folgen der aktuellen OWASP-Empfehlung fuer
   PBKDF2-HMAC-SHA256.
*/

const crypto = require('crypto');
const ablage = require('./ablage');

const ITERATIONEN = 210000;
const SCHLUESSELLAENGE = 32;
const MAX_FEHLVERSUCHE = 5;
const SPERRE_MS = 5 * 60 * 1000;

function b64(buf) { return buf.toString('base64'); }

function hashen(passwort, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(passwort, salt, ITERATIONEN, SCHLUESSELLAENGE, 'sha256', (err, key) => {
      if (err) reject(err); else resolve(key);
    });
  });
}

async function passwortHash(passwort) {
  const salt = crypto.randomBytes(16);
  const hash = await hashen(passwort, salt);
  return { algo: 'pbkdf2-sha256', iterationen: ITERATIONEN, salt: b64(salt), hash: b64(hash) };
}

async function passwortPrueft(passwort, eintrag) {
  if (!eintrag || eintrag.algo !== 'pbkdf2-sha256') return false;
  const salt = Buffer.from(eintrag.salt, 'base64');
  const berechnet = await hashen(passwort, salt);
  const gespeichert = Buffer.from(eintrag.hash, 'base64');
  if (berechnet.length !== gespeichert.length) return false;
  return crypto.timingSafeEqual(berechnet, gespeichert);
}

/* ---------- Kontenverwaltung ---------- */

function uid(prefix = 'id') {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

/* Erlaubte Zeichen im Benutzernamen: Buchstaben, Ziffern, Punkt, Bindestrich,
   Unterstrich. Bewusst keine Leerzeichen und keine Umlaute – der Name wird an
   fremden Tastaturen und in fremden Tastaturbelegungen eingetippt, und ein
   „Mitarbeiter Eins" mit Leerzeichen laedt zum Vertippen ein. Die Oberflaeche
   zeigt dieselbe Regel an, durchgesetzt wird sie aber hier. */
const BENUTZERNAME_MUSTER = /^[a-zA-Z0-9._-]{2,32}$/;

/**
 * Prueft einen Benutzernamen und gibt ihn getrimmt zurueck.
 * Wirft mit einem Satz, der direkt in der Oberflaeche angezeigt werden kann.
 */
function benutzernamePruefen(benutzer) {
  const b = String(benutzer ?? '').trim();
  if (!BENUTZERNAME_MUSTER.test(b)) {
    const fehler = new Error(
      'Der Benutzername darf nur Buchstaben, Ziffern, Punkt, Bindestrich und '
      + 'Unterstrich enthalten (2 bis 32 Zeichen) – keine Leerzeichen und keine Umlaute.'
    );
    fehler.status = 400;
    throw fehler;
  }
  return b;
}

/** Feldwerte, die ein Admin ueber die Kontenliste zu sehen bekommen darf. */
function oeffentlichesKonto(k) {
  return {
    id: k.id, benutzer: k.benutzer, name: k.name, rolle: k.rolle, aktiv: k.aktiv,
    wechselNoetig: !!k.wechselNoetig, letzteAnmeldung: k.letzteAnmeldung,
    gesperrtBis: k.gesperrtBis || null,
  };
}

async function kontoFinden(benutzer) {
  const team = await ablage.teamLesen();
  if (!team) return null;
  const b = String(benutzer || '').trim().toLowerCase();
  return team.konten.find((k) => k.benutzer.toLowerCase() === b) || null;
}

async function kontoMitId(id) {
  const team = await ablage.teamLesen();
  if (!team) return null;
  return team.konten.find((k) => k.id === id) || null;
}

async function kontenAlle() {
  const team = await ablage.teamLesen();
  return (team?.konten || []).map(oeffentlichesKonto);
}

/**
 * Meldet ein Konto an. Gibt bei Erfolg das oeffentliche Konto zurueck,
 * sonst null. Fehlversuche werden gezaehlt; ab MAX_FEHLVERSUCHE sperrt das
 * Konto fuer SPERRE_MS.
 */
async function anmelden(benutzer, passwort) {
  const konto = await kontoFinden(benutzer);
  if (!konto || !konto.aktiv) return { fehler: 'unbekannt' };

  if (konto.gesperrtBis && konto.gesperrtBis > Date.now()) {
    return { fehler: 'gesperrt', bis: konto.gesperrtBis };
  }

  const ok = await passwortPrueft(passwort, konto.passwort);

  await ablage.teamAendern((team) => {
    const k = team.konten.find((x) => x.id === konto.id);
    if (!k) return;
    if (ok) {
      k.fehlversuche = 0;
      k.gesperrtBis = null;
      k.letzteAnmeldung = new Date().toISOString();
    } else {
      k.fehlversuche = (k.fehlversuche || 0) + 1;
      if (k.fehlversuche >= MAX_FEHLVERSUCHE) k.gesperrtBis = Date.now() + SPERRE_MS;
    }
  });

  if (!ok) return { fehler: 'passwort' };
  return { konto: oeffentlichesKonto({ ...konto, gesperrtBis: null }) };
}

async function passwortAendern(id, neu) {
  const passwort = await passwortHash(neu);
  await ablage.teamAendern((team) => {
    const k = team.konten.find((x) => x.id === id);
    if (!k) throw new Error('Konto nicht gefunden');
    k.passwort = passwort;
    k.wechselNoetig = false;
  });
}

/** Neues Konto anlegen. datei wird passend zur id vergeben. */
async function kontoAnlegen({ benutzer, name, rolle, passwort }) {
  const benutzerGeprueft = benutzernamePruefen(benutzer);
  const id = uid('ma');
  const hash = await passwortHash(passwort);
  const eintrag = {
    id, benutzer: benutzerGeprueft, name: String(name).trim(),
    rolle: rolle === 'admin' ? 'admin' : 'mitarbeiter',
    aktiv: true, datei: `mitarbeiter/${id}.json`,
    passwort: hash, wechselNoetig: true,
    letzteAnmeldung: null, fehlversuche: 0, gesperrtBis: null,
  };
  await ablage.teamAendern((team) => {
    if (team.konten.some((k) => k.benutzer.toLowerCase() === eintrag.benutzer.toLowerCase())) {
      throw new Error('Dieser Benutzername ist bereits vergeben.');
    }
    team.konten.push(eintrag);
  });
  return oeffentlichesKonto(eintrag);
}

async function kontoAktivSetzen(id, aktiv) {
  await ablage.teamAendern((team) => {
    const k = team.konten.find((x) => x.id === id);
    if (!k) throw new Error('Konto nicht gefunden');
    k.aktiv = !!aktiv;
  });
}

/**
 * Benutzernamen eines bestehenden Kontos aendern. Die Kollisionspruefung
 * schliesst das eigene Konto aus – sonst liesse sich nicht einmal die
 * Schreibweise korrigieren (Mitarbeiter → mitarbeiter waere „bereits vergeben").
 * Bestehende Sitzungen dieses Kontos werden vom Aufrufer verworfen, damit
 * niemand mit einer veralteten Anmeldung weiterarbeitet.
 */
async function benutzernameAendern(id, neu) {
  const benutzerGeprueft = benutzernamePruefen(neu);
  await ablage.teamAendern((team) => {
    const k = team.konten.find((x) => x.id === id);
    if (!k) throw new Error('Konto nicht gefunden');
    const kollision = team.konten.find(
      (x) => x.id !== id && x.benutzer.toLowerCase() === benutzerGeprueft.toLowerCase()
    );
    if (kollision) throw new Error('Dieser Benutzername ist bereits vergeben.');
    k.benutzer = benutzerGeprueft;
  });
}

async function kontoUmbenennen(id, name) {
  await ablage.teamAendern((team) => {
    const k = team.konten.find((x) => x.id === id);
    if (!k) throw new Error('Konto nicht gefunden');
    k.name = String(name).trim();
  });
}

module.exports = {
  passwortHash, passwortPrueft, benutzernamePruefen,
  kontoFinden, kontoMitId, kontenAlle, oeffentlichesKonto,
  anmelden, passwortAendern, kontoAnlegen, kontoAktivSetzen, kontoUmbenennen, benutzernameAendern,
};
