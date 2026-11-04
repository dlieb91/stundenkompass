/**
 * Einmalige Einrichtung des Team-Betriebs.
 * Wird von Einrichten.bat gestartet – auf dem Rechner, der als Server
 * dienen soll. Legt daten/team.json an, fragt nach dem ersten
 * Admin-Konto und übernimmt, falls vorhanden, eine bestehende
 * Einzelplatz-stunden.json als dessen Datensatz.
 *
 * Danach: Start-Server.bat starten.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const ablage = require('./server/ablage');
const konten = require('./server/konten');

// Ort der bisherigen Einzelplatz-Datei, falls vorhanden – aus der alten
// storage.js: der Nutzer hat sie selbst gewählt, sie wird deshalb nur an
// der bekannten Standardstelle gesucht, nicht erraten.
const ALTE_DATEIEN = [
  path.join(os.homedir(), 'Documents', 'StundenKompass', 'stunden.json'),
];

function frage(rl, text) {
  return new Promise((resolve) => rl.question(text, (antwort) => resolve(antwort.trim())));
}

const STRG_C = '\x03';
const RUECKTASTE = ['\x08', '\x7f'];

/**
 * Passwort ohne Echo im Terminal abfragen (funktioniert im Standard-Windows-
 * Terminal, das ueber Einrichten.bat oeffnet). Ohne echtes TTY – etwa wenn
 * die Eingabe umgeleitet wird – kommen Zeichen nicht einzeln, sondern in
 * ganzen Bloecken an; dann faellt die Funktion auf eine sichtbare readline-
 * Abfrage zurueck, statt endlos auf ein einzelnes Zeilenende zu warten.
 */
function passwortFrage(stdin, text) {
  if (!stdin.isTTY) {
    const rl = readline.createInterface({ input: stdin, output: process.stdout });
    return frage(rl, text).then((antwort) => { rl.close(); return antwort; });
  }

  return new Promise((resolve) => {
    process.stdout.write(text);
    let eingabe = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (zeichen) => {
      if (zeichen === '\r' || zeichen === '\n') {
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        process.stdout.write('\n');
        resolve(eingabe);
      } else if (zeichen === STRG_C) {
        process.exit(1);
      } else if (RUECKTASTE.includes(zeichen)) {
        eingabe = eingabe.slice(0, -1);
      } else {
        eingabe += zeichen;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  console.log('');
  console.log('  StundenKompass – Team-Betrieb einrichten');
  console.log('  ' + '─'.repeat(40));
  console.log('');

  if (ablage.istEingerichtet()) {
    console.log('  Es besteht bereits eine Einrichtung unter daten/team.json.');
    console.log('  Um sie nicht zu überschreiben, bricht dieses Skript ab.');
    console.log('  Konten verwaltest du danach in der App unter „Konten".');
    console.log('');
    process.exit(0);
  }

  // Ohne echte Konsole (z. B. umgeleitete Eingabe) beantwortet readline nur
  // die erste Frage und haengt danach reglos fest, ohne jede Rueckmeldung.
  // Lieber sofort und deutlich abbrechen als scheinbar eingefroren dastehen.
  if (!process.stdin.isTTY) {
    console.log('  Dieses Skript braucht eine echte Konsole für die Eingabe.');
    console.log('  Bitte Einrichten.bat per Doppelklick starten, nicht mit umgeleiteter Eingabe.');
    console.log('');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const betrieb = (await frage(rl, '  Name des Betriebs (erscheint in der App): ')) || 'Mein Betrieb';
  console.log('');
  console.log('  Erstes Konto – die Verwaltung (Rolle "admin"):');
  const name = await frage(rl, '  Name: ');
  if (!name) {
    rl.close();
    console.log('\n  Ein Name ist erforderlich. Abgebrochen.\n');
    process.exit(1);
  }

  // Nur Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich – dieselbe Regel
  // wie beim Anlegen weiterer Konten in der App (server/konten.js).
  let benutzer = '';
  for (;;) {
    const eingabe = await frage(rl, '  Benutzername (z. B. admin): ');
    try {
      benutzer = konten.benutzernamePruefen(eingabe);
      break;
    } catch (e) {
      console.log('  ' + e.message);
    }
  }
  rl.close();

  let passwort = await passwortFrage(process.stdin, '  Passwort (mind. 6 Zeichen): ');
  while (passwort.length < 6) {
    console.log('  Zu kurz – mindestens 6 Zeichen.');
    passwort = await passwortFrage(process.stdin, '  Passwort (mind. 6 Zeichen): ');
  }

  await ablage.ordnerAnlegen();

  const hash = await konten.passwortHash(passwort);
  const id = 'ma-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  const jetzt = new Date().toISOString();

  const team = {
    schemaVersion: 1,
    meta: { name: betrieb, erstelltAm: jetzt, geaendertAm: jetzt },
    konten: [{
      id, benutzer, name, rolle: 'admin', aktiv: true, datei: `mitarbeiter/${id}.json`,
      passwort: hash, wechselNoetig: false,
      letzteAnmeldung: null, fehlversuche: 0, gesperrtBis: null,
    }],
    protokoll: [],
  };

  await ablage.teamAnlegen(team);

  // Bestehende Einzelplatz-Datei übernehmen, falls vorhanden.
  const alte = ALTE_DATEIEN.find((p) => fs.existsSync(p));
  if (alte) {
    console.log('');
    console.log(`  Gefunden: ${alte}`);
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const antwort = await frage(rl2, '  Als Datensatz für dieses Konto übernehmen? (j/n): ');
    rl2.close();
    if (/^j/i.test(antwort)) {
      const inhalt = JSON.parse(fs.readFileSync(alte, 'utf8'));
      await ablage.sicherungAblegen('import-' + id, inhalt); // unangetastete Kopie zuerst
      await ablage.datensatzSchreiben(id, inhalt, null);
      console.log('  Übernommen.');
    }
  }

  console.log('');
  console.log('  Fertig. Als Nächstes: Start-Server.bat starten.');
  console.log('');
}

main().catch((e) => {
  console.error('\n  Einrichtung fehlgeschlagen:', e.message, '\n');
  process.exit(1);
});
