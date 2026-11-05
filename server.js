/**
 * Server fuer StundenKompass.
 * Wird von Start-Server.bat auf dem Rechner gestartet, der die Daten des
 * ganzen Teams haelt (Buero-PC oder NAS). Liefert die App-Dateien aus
 * diesem Ordner aus und beantwortet daneben die /api/-Routen aus
 * server/api.js: Anmeldung, Rollen, Lesen und Schreiben der Datensaetze.
 *
 * Fester Port 8870, gebunden an alle Netzwerkschnittstellen (0.0.0.0) –
 * Mitarbeiter an anderen Rechnern im selben Netz brauchen eine
 * gleichbleibende Adresse, um die App im Browser zu oeffnen.
 *
 * Nur fuers vertrauenswuerdige Firmennetz gedacht: die Verbindung ist
 * unverschluesseltes HTTP. Nicht in offenes WLAN oder ins Internet
 * durchreichen.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const api = require('./server/api');
const ablage = require('./server/ablage');

const ROOT = __dirname;
const PORT = 8870;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

/* Ausgeliefert wird nur, was der Browser fuer die App braucht. Der Ordner
   enthaelt daneben daten/ mit allen Datensaetzen und den Passwort-Hashes
   der Konten – ohne diese Liste haette jeder im Netz sie mit einem
   einzigen GET abholen koennen, ganz ohne Anmeldung. */
const OEFFENTLICH_DATEIEN = new Set(['/index.html', '/manifest.webmanifest', '/sw.js']);
const OEFFENTLICH_ORDNER = ['/css/', '/js/', '/bilder/'];

function istOeffentlich(urlPath) {
  return OEFFENTLICH_DATEIEN.has(urlPath) || OEFFENTLICH_ORDNER.some((o) => urlPath.startsWith(o));
}

function statischeDatei(req, res, urlPath) {
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);
  // Verzeichniswechsel nach oben unterbinden, und nichts ausser Programmdateien
  if (!filePath.startsWith(ROOT + path.sep) || !istOeffentlich(urlPath) || urlPath.includes('..')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Nicht gefunden: ' + urlPath);
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nicht gefunden: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }

  if (urlPath.startsWith('/api/')) {
    api.behandeln(req, res).catch((e) => {
      console.error('Unerwarteter API-Fehler:', e);
      if (!res.headersSent) res.writeHead(500).end('Serverfehler');
    });
    return;
  }

  statischeDatei(req, res, urlPath);
});

function findBrowser() {
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env['LOCALAPPDATA'] || '';
  const candidates = [
    path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(local, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function openBrowser(url) {
  if (process.env.KEIN_BROWSER) return;
  const exe = findBrowser();
  try {
    if (exe) {
      spawn(exe, [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    console.log('Browser konnte nicht automatisch geoeffnet werden.');
  }
}

/** Adressen, unter denen andere Rechner im Netz diesen Server erreichen. */
function lanAdressen() {
  const raus = [];
  for (const stufen of Object.values(os.networkInterfaces())) {
    for (const s of stufen || []) {
      if (s.family === 'IPv4' && !s.internal) raus.push(s.address);
    }
  }
  return raus;
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`  Port ${PORT} ist bereits belegt.`);
    console.error('  Läuft StundenKompass schon in einem anderen Fenster?');
    console.error('');
  } else {
    console.error('Server konnte nicht gestartet werden:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  if (!ablage.istEingerichtet()) {
    console.log('  Noch nicht eingerichtet.');
    console.log('  Bitte zuerst Einrichten.bat ausführen und diesen Server danach neu starten.');
    console.log('');
    process.exit(1);
    return;
  }

  console.log('  StundenKompass läuft.');
  console.log(`  An diesem Rechner: http://localhost:${PORT}/`);
  const adressen = lanAdressen();
  if (adressen.length) {
    console.log('  Für andere Rechner im selben Netz:');
    for (const a of adressen) console.log(`    http://${a}:${PORT}/`);
  }
  console.log('');
  console.log('  Dieses Fenster bitte offen lassen, solange das Team die App nutzt.');
  console.log('  Zum Beenden: Fenster schließen oder Strg+C.');
  console.log('');
  openBrowser(`http://localhost:${PORT}/`);
});
