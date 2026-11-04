/* API-Routen: Anmeldung, Rollen, Datenzugriff.

   behandeln(req, res) gibt true zurueck, wenn die Anfrage eine /api/-Route
   war (behandelt oder mit Fehler beantwortet) – server.js liefert alles
   andere weiterhin als statische Datei aus.

   Rechte werden ausschliesslich hier erzwungen, nicht in der Oberflaeche:
   ein Mitarbeiter, der /api/daten?konto=<fremd> von Hand aufruft, bekommt
   403 und keine Daten.
*/

const { URL } = require('url');
const konten = require('./konten');
const sitzungen = require('./sitzungen');
const ablage = require('./ablage');
const stammdaten = require('./stammdaten');

const COOKIE_NAME = 'sk_sitzung';
const MAX_BODY = 2 * 1024 * 1024; // 2 MB – reicht fuer einen ganzen Datensatz

/* ---------- Hilfen ---------- */

function cookies(req) {
  const kopf = req.headers.cookie || '';
  const raus = {};
  for (const teil of kopf.split(';')) {
    const i = teil.indexOf('=');
    if (i === -1) continue;
    raus[teil.slice(0, i).trim()] = decodeURIComponent(teil.slice(i + 1).trim());
  }
  return raus;
}

function cookieSetzen(res, token) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
}

function cookieLoeschen(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

function json(res, status, obj) {
  const text = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function fehler(res, status, meldung, zusatz) {
  json(res, status, { fehler: meldung, ...zusatz });
}

function koerper(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const teile = [];
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY) { reject(Object.assign(new Error('zu groß'), { code: 'GROESSE' })); req.destroy(); return; }
      teile.push(chunk);
    });
    req.on('end', () => {
      if (!teile.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(teile).toString('utf8'))); }
      catch { reject(Object.assign(new Error('ungültiges JSON'), { code: 'JSON' })); }
    });
    req.on('error', reject);
  });
}

/** Sitzung aus dem Cookie lesen; antwortet selbst mit 401 und gibt null, wenn keine gueltige Sitzung besteht. */
function sitzungOderAbweisen(req, res) {
  const s = sitzungen.pruefen(cookies(req)[COOKIE_NAME]);
  if (!s) { fehler(res, 401, 'Nicht angemeldet'); return null; }
  return s;
}

function nurAdmin(s, res) {
  if (s.rolle !== 'admin') { fehler(res, 403, 'Nur für die Verwaltung'); return false; }
  return true;
}

/** Welches Konto darf angesprochen werden: eigenes immer, fremdes nur als Admin. */
async function kontoZielPruefen(s, res, angefordertId) {
  const zielId = angefordertId || s.kontoId;
  if (zielId !== s.kontoId && s.rolle !== 'admin') {
    fehler(res, 403, 'Kein Zugriff auf dieses Konto');
    return null;
  }
  const konto = await konten.kontoMitId(zielId);
  if (!konto || !konto.aktiv) { fehler(res, 404, 'Konto nicht gefunden'); return null; }
  return konto;
}

/* ---------- Routen ---------- */

async function behandeln(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;

  try {
    await route(req, res, url);
  } catch (e) {
    if (e.code === 'GROESSE') fehler(res, 413, 'Anfrage zu groß');
    else if (e.code === 'JSON') fehler(res, 400, 'Ungültiges JSON');
    else if (e.status) fehler(res, e.status, e.message);
    else {
      console.error('API-Fehler:', e);
      fehler(res, 500, e.message || 'Unbekannter Fehler');
    }
  }
  return true;
}

async function route(req, res, url) {
  const pfad = url.pathname;
  const m = req.method;

  /* ---- Anmeldung ---- */

  if (pfad === '/api/anmelden' && m === 'POST') {
    const body = await koerper(req) || {};
    const ergebnis = await konten.anmelden(body.benutzer, body.passwort);
    if (ergebnis.fehler === 'gesperrt') {
      const minuten = Math.ceil((ergebnis.bis - Date.now()) / 60000);
      return fehler(res, 423, `Konto gesperrt – bitte in ${minuten} Minute(n) erneut versuchen`);
    }
    if (ergebnis.fehler) return fehler(res, 401, 'Benutzername oder Passwort falsch');
    const token = sitzungen.erstellen(ergebnis.konto);
    cookieSetzen(res, token);
    return json(res, 200, { konto: ergebnis.konto });
  }

  if (pfad === '/api/abmelden' && m === 'POST') {
    const token = cookies(req)[COOKIE_NAME];
    if (token) sitzungen.verwerfen(token);
    cookieLoeschen(res);
    return json(res, 200, { ok: true });
  }

  /* Ab hier ist eine gueltige Sitzung Pflicht. */
  const s = sitzungOderAbweisen(req, res);
  if (!s) return;

  if (pfad === '/api/sitzung' && m === 'GET') {
    const konto = await konten.kontoMitId(s.kontoId);
    if (!konto || !konto.aktiv) { cookieLoeschen(res); return fehler(res, 401, 'Konto nicht mehr gültig'); }
    return json(res, 200, { konto: konten.oeffentlichesKonto(konto) });
  }

  if (pfad === '/api/passwort' && m === 'POST') {
    const body = await koerper(req) || {};
    if (!body.neu || String(body.neu).length < 6) {
      return fehler(res, 400, 'Das Passwort muss mindestens 6 Zeichen haben.');
    }
    await konten.passwortAendern(s.kontoId, String(body.neu));
    return json(res, 200, { ok: true });
  }

  /* ---- Datensatz eines Kontos ---- */

  if (pfad === '/api/daten' && m === 'GET') {
    const konto = await kontoZielPruefen(s, res, url.searchParams.get('konto'));
    if (!konto) return;
    const daten = await ablage.datensatzLesen(konto.id);
    return json(res, 200, { daten });
  }

  if (pfad === '/api/daten' && m === 'PUT') {
    const konto = await kontoZielPruefen(s, res, url.searchParams.get('konto'));
    if (!konto) return;
    const body = await koerper(req);
    if (!body || typeof body !== 'object') return fehler(res, 400, 'Datensatz fehlt');
    const erwarteteVersion = body.meta?.version ?? null;
    try {
      const gespeichert = await ablage.datensatzSchreiben(konto.id, body, erwarteteVersion);
      return json(res, 200, { daten: gespeichert });
    } catch (e) {
      if (e.code === 'VERSION') return json(res, 409, { fehler: e.message, daten: e.aktuell });
      throw e;
    }
  }

  /* ---- Stammdaten: Kunden und Projekte ----
     Lesen duerfen alle Angemeldeten – Mitarbeiter brauchen die Projektliste
     zum Buchen. Schreiben bleibt beim Admin. */

  if (pfad === '/api/stammdaten' && m === 'GET') {
    return json(res, 200, { stammdaten: await stammdaten.lesen() });
  }

  if (pfad === '/api/stammdaten' && m === 'POST') {
    if (!nurAdmin(s, res)) return;
    const body = await koerper(req) || {};
    return stammdatenAktion(res, body);
  }

  /* ---- Team – nur Admin ---- */

  if (pfad === '/api/team' && m === 'GET') {
    if (!nurAdmin(s, res)) return;
    return json(res, 200, { konten: await konten.kontenAlle() });
  }

  if (pfad === '/api/uebersicht' && m === 'GET') {
    if (!nurAdmin(s, res)) return;
    const alle = await konten.kontenAlle();
    const aktive = alle.filter((k) => k.aktiv);
    const datensaetze = await ablage.alleDatensaetze(aktive.map((k) => k.id));
    return json(res, 200, {
      mitarbeiter: aktive.map((k) => ({ konto: k, daten: datensaetze[k.id] })),
    });
  }

  if (pfad === '/api/konto' && m === 'POST') {
    if (!nurAdmin(s, res)) return;
    const body = await koerper(req) || {};
    return kontoAktion(res, body);
  }

  if (pfad === '/api/sicherungen' && m === 'GET') {
    if (!nurAdmin(s, res)) return;
    const id = url.searchParams.get('konto');
    if (!id) return fehler(res, 400, 'konto fehlt');
    return json(res, 200, { sicherungen: await ablage.sicherungenAuflisten(id) });
  }

  if (pfad === '/api/sicherungen/wiederherstellen' && m === 'POST') {
    if (!nurAdmin(s, res)) return;
    const body = await koerper(req) || {};
    if (!body.konto || !body.tag) return fehler(res, 400, 'konto und tag sind erforderlich');
    const konto = await konten.kontoMitId(body.konto);
    if (!konto) return fehler(res, 404, 'Konto nicht gefunden');
    const gesichert = await ablage.sicherungLesen(body.konto, body.tag);
    if (!gesichert) return fehler(res, 404, 'Sicherung nicht gefunden');
    // aktuellen Stand vorher selbst sichern, dann ungeprueft ueberschreiben
    const aktuell = await ablage.datensatzLesen(body.konto);
    if (aktuell) await ablage.sicherungAblegen(`${body.konto}-vor-wiederherstellung`, aktuell);
    const wiederhergestellt = await ablage.datensatzSchreiben(body.konto, gesichert, null);
    return json(res, 200, { daten: wiederhergestellt });
  }

  fehler(res, 404, 'Unbekannte Route');
}

async function kontoAktion(res, body) {
  const aktion = body.aktion;
  if (aktion === 'anlegen') {
    if (!body.benutzer || !body.name || !body.passwort) {
      return fehler(res, 400, 'benutzer, name und passwort sind erforderlich');
    }
    if (String(body.passwort).length < 6) return fehler(res, 400, 'Das Passwort muss mindestens 6 Zeichen haben.');
    const konto = await konten.kontoAnlegen(body);
    return json(res, 200, { konto });
  }
  if (aktion === 'aktiv') {
    if (!body.id) return fehler(res, 400, 'id fehlt');
    await konten.kontoAktivSetzen(body.id, !!body.aktiv);
    if (!body.aktiv) sitzungen.verwerfenFuerKonto(body.id);
    return json(res, 200, { ok: true });
  }
  if (aktion === 'umbenennen') {
    if (!body.id || !body.name) return fehler(res, 400, 'id und name sind erforderlich');
    await konten.kontoUmbenennen(body.id, body.name);
    return json(res, 200, { ok: true });
  }
  if (aktion === 'benutzername') {
    if (!body.id || !body.benutzer) return fehler(res, 400, 'id und benutzer sind erforderlich');
    await konten.benutzernameAendern(body.id, body.benutzer);
    sitzungen.verwerfenFuerKonto(body.id);
    return json(res, 200, { ok: true });
  }
  if (aktion === 'passwort-zuruecksetzen') {
    if (!body.id || !body.passwort) return fehler(res, 400, 'id und passwort sind erforderlich');
    if (String(body.passwort).length < 6) return fehler(res, 400, 'Das Passwort muss mindestens 6 Zeichen haben.');
    await konten.passwortAendern(body.id, body.passwort);
    sitzungen.verwerfenFuerKonto(body.id);
    return json(res, 200, { ok: true });
  }
  return fehler(res, 400, 'Unbekannte Aktion');
}

async function stammdatenAktion(res, body) {
  const aktion = body.aktion;

  if (aktion === 'kunde-anlegen') {
    const kunde = await stammdaten.kundeAnlegen(body);
    return json(res, 200, { kunde });
  }
  if (aktion === 'kunde-aendern') {
    if (!body.id) return fehler(res, 400, 'id fehlt');
    await stammdaten.kundeAendern(body.id, body);
    return json(res, 200, { ok: true });
  }
  if (aktion === 'kunde-aktiv') {
    if (!body.id) return fehler(res, 400, 'id fehlt');
    await stammdaten.kundeAktivSetzen(body.id, !!body.aktiv);
    return json(res, 200, { ok: true });
  }

  if (aktion === 'projekt-anlegen') {
    const projekt = await stammdaten.projektAnlegen(body);
    return json(res, 200, { projekt });
  }
  if (aktion === 'projekt-aendern') {
    if (!body.id) return fehler(res, 400, 'id fehlt');
    await stammdaten.projektAendern(body.id, body);
    return json(res, 200, { ok: true });
  }
  if (aktion === 'projekt-aktiv') {
    if (!body.id) return fehler(res, 400, 'id fehlt');
    await stammdaten.projektAktivSetzen(body.id, !!body.aktiv);
    return json(res, 200, { ok: true });
  }

  if (aktion === 'projektpflicht') {
    await stammdaten.projektpflichtSetzen(!!body.an);
    return json(res, 200, { ok: true });
  }

  return fehler(res, 400, 'Unbekannte Aktion');
}

module.exports = { behandeln };
