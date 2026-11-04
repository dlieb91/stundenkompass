/* Sitzungen – im Arbeitsspeicher, nicht in einer Datei.

   Ein Neustart des Servers meldet damit alle ab; das ist gewollt, nicht
   nur hingenommen: der Server laeuft dauerhaft auf einem Rechner, ein
   Neustart ist ein seltener, bewusster Schritt.

   Token kommen aus crypto.randomBytes – nicht aus Math.random, das fuer
   Sitzungs-Token nicht sicher genug ist. Ablauf nach ABLAUF_MS Untaetigkeit,
   bei jedem Zugriff verlaengert.
*/

const crypto = require('crypto');

const ABLAUF_MS = 12 * 60 * 60 * 1000; // 12 Stunden Untaetigkeit
const sitzungen = new Map(); // token -> { kontoId, benutzer, rolle, bis }

function aufraeumen() {
  const jetzt = Date.now();
  for (const [token, s] of sitzungen) if (s.bis < jetzt) sitzungen.delete(token);
}

function erstellen(konto) {
  aufraeumen();
  const token = crypto.randomBytes(32).toString('base64url');
  sitzungen.set(token, {
    kontoId: konto.id, benutzer: konto.benutzer, rolle: konto.rolle,
    bis: Date.now() + ABLAUF_MS,
  });
  return token;
}

/** Liefert die Sitzung zu einem Token und verlaengert ihren Ablauf. */
function pruefen(token) {
  if (!token) return null;
  const s = sitzungen.get(token);
  if (!s) return null;
  if (s.bis < Date.now()) { sitzungen.delete(token); return null; }
  s.bis = Date.now() + ABLAUF_MS;
  return s;
}

function verwerfen(token) {
  sitzungen.delete(token);
}

/** Alle Sitzungen eines Kontos verwerfen – etwa nach Passwortwechsel oder Deaktivierung. */
function verwerfenFuerKonto(kontoId) {
  for (const [token, s] of sitzungen) if (s.kontoId === kontoId) sitzungen.delete(token);
}

module.exports = { erstellen, pruefen, verwerfen, verwerfenFuerKonto };
