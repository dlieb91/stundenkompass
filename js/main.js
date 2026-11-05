/* Einstieg: Betriebsart, Anmeldung bzw. Ablagewahl, Navigation, Router.

   Zwei Wege in die App (siehe betrieb.js):
     team     Anmeldung am Server, danach der Datensatz des Kontos
     einzel   Wahl der Ablage – Ordner, Dropbox oder dieses Geraet –,
              danach die stunden.json darin. Keine Konten, kein Server.
   Ab appStarten() laufen beide Wege gemeinsam weiter.
*/

import {
  $, el, leeren, toast, modal,
} from './util.js';
import {
  speicher, datenquelle, datenLesen, sofortSpeichern,
  istUnterstuetzt, verfuegbareAblagen, ablageWaehlen, rechtePruefen, ablageMerken,
  gemerkteAblage, ablageUebernehmen, erstbezug,
} from './storage.js';
import { betrieb, betriebErmitteln, istEinzel } from './betrieb.js';
import { aufApple, speicherWarnung } from './speicher/lokal.js';
import * as dbx from './speicher/dropboxApi.js';
import { dateiFeld } from './uebernahme.js';
import { kvDel } from './db.js';
import {
  anbinden as abgleichAnbinden, anzeigeAnmelden, dropboxAnmelden,
} from './abgleich.js';
import {
  sitzung, gesetzt as sitzungGesetzt, verworfen as sitzungVerworfen,
  istAdmin, eigeneId, betrachteteId, betrachtenSetzen, betrachtetSichSelbst,
} from './sitzung.js';
import * as api from './api.js';
import {
  state, laden, neueDaten, abonnieren, serverStandUebernehmen, serverMetaUebernehmen,
} from './store.js';
import { dashboard } from './views/dashboard.js';
import { erfassung } from './views/erfassung.js';
import { vorgaben } from './views/vorgaben.js';
import { einstellungen } from './views/einstellungen.js';
import { team } from './views/team.js';
import { konten } from './views/konten.js';
import { auswertung } from './views/auswertung.js';
import { stammdaten as stammdatenAnsicht } from './views/stammdaten.js';
import { stammdatenLaden } from './stammdaten.js';
import { gesamtSaldo, erfassungsBeginn } from './saldo.js';
import { heuteISO } from './kalender.js';

/* ---------- Ansichten ---------- */

/* 24x24-Pfade ohne fill; stroke setzt navAufbauen(). */
const ICONS = {
  dashboard: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  erfassung: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h3M8 17h6"/>',
  vorgaben: '<path d="M4 6h16M4 12h16M4 18h9"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>',
  einstellungen: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  team: '<path d="M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="6" r="4"/><path d="M23 20v-2a4 4 0 0 0-3-3.87"/><path d="M16 2.13a4 4 0 0 1 0 7.75"/>',
  konten: '<circle cx="8.5" cy="7" r="4"/><path d="M2.5 21v-2a5.5 5.5 0 0 1 5.5-5.5h1"/><path d="M17 8v6M20 11h-6"/>',
  auswertung: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  stammdaten: '<rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="15" width="7" height="7" rx="1"/><rect x="14" y="15" width="7" height="7" rx="1"/>',
};

/* Register der Ansichten. Pflicht ist { titel, view }, dazu optional:
     navTitel   kuerzerer Text in der Seitenleiste
     zaehler    (daten) => Zahl, erscheint als Abzeichen
     navKey     hebt einen anderen Nav-Eintrag hervor (fuer Detailrouten)
   titel darf eine Funktion sein, wenn er von den Daten abhaengt. */
const ANSICHTEN = {
  team: { titel: 'Team', view: team },
  dashboard: { titel: 'Dashboard', view: dashboard },
  erfassung: {
    titel: 'Arbeitszeiten erfassen', navTitel: 'Erfassung', view: erfassung,
    // Das Abzeichen zeigt die Arbeitstage ohne Eintrag – die einzige Zahl,
    // die einen aus jeder Ansicht heraus interessieren sollte.
    zaehler: (d) => (erfassungsBeginn(d) ? gesamtSaldo(d, heuteISO()).luecken : 0),
  },
  vorgaben: { titel: 'Vorgaben', view: vorgaben },
  auswertung: { titel: 'Auswertung', view: auswertung },
  stammdaten: { titel: 'Stammdaten', navTitel: 'Kunden & Projekte', view: stammdatenAnsicht },
  konten: { titel: 'Konten', view: konten },
  einstellungen: { titel: 'Einstellungen', view: einstellungen },
};

/* Reihenfolge in der Seitenleiste, je Rolle – 'einstellungen' wird unten
   abgesetzt (siehe navAufbauen). Team, Auswertung, Stammdaten und Konten
   sieht nur der Admin. */
const REIHENFOLGE_MITARBEITER = ['dashboard', 'erfassung', 'vorgaben', 'einstellungen'];
const REIHENFOLGE_ADMIN = [
  'team', 'dashboard', 'erfassung', 'vorgaben', 'auswertung', 'stammdaten', 'konten', 'einstellungen',
];

/* Einzelplatz: alles, was eine Person fuer sich selbst braucht – ohne Team
   und Konten, die es dort nicht gibt. */
const REIHENFOLGE_EINZEL = [
  'dashboard', 'erfassung', 'vorgaben', 'auswertung', 'stammdaten', 'einstellungen',
];

const reihenfolge = () => {
  if (istEinzel()) return REIHENFOLGE_EINZEL;
  return istAdmin() ? REIHENFOLGE_ADMIN : REIHENFOLGE_MITARBEITER;
};

/* ---------- Design ---------- */

function themaSetzen(thema) {
  document.documentElement.dataset.theme = thema;
  localStorage.setItem('stundenkompass-theme', thema);
}

function themaInitialisieren() {
  const gespeichert = localStorage.getItem('stundenkompass-theme');
  themaSetzen(gespeichert || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
}

/* ---------- Anmeldung ---------- */

function startBereich() { return $('#startupBody'); }

function startFehler(titel, html) {
  const body = leeren(startBereich());
  body.append(el('div.startup-err', {}, [el('strong', { text: titel }), el('div', { html, style: 'margin-top:6px' })]));
}

async function starten() {
  themaInitialisieren();
  datenquelle(() => state.daten);

  if (location.protocol === 'file:') {
    startFehler('Bitte über eine Adresse öffnen',
      'Die App wurde direkt als Datei geöffnet. So erlaubt der Browser weder Ordnerzugriff noch Server.<br><br>'
      + 'Im Team: <strong>Start-Server.bat</strong> starten. Für dich allein: die Adresse aus der LIESMICH öffnen.');
    return;
  }

  await betriebErmitteln();
  if (istEinzel()) {
    await einzelStarten();
    return;
  }
  if (betrieb.serverFehlt) {
    startFehler('Server nicht erreichbar',
      'Läuft der Server noch? Auf dem Server-Rechner muss <strong>Start-Server.bat</strong> offen sein.<br><br>'
      + 'Prüfe außerdem, ob die Adresse in der Adressleiste stimmt.');
    return;
  }
  teamStarten();
}

/* ---------- Team: Anmeldung am Server ---------- */

async function teamStarten() {
  window.addEventListener('sk:abgemeldet', abgemeldetBehandeln);

  // Vor jedem moeglichen Speichern verdrahtet – auch vor dem allerersten,
  // das schon beim Anlegen eines frischen Kontos laeuft, lange bevor
  // appStarten() (und damit die Kopfzeile) ueberhaupt existiert.
  speicher.onKonflikt = (daten) => {
    serverStandUebernehmen(daten);
    toast('Der Stand wurde inzwischen an anderer Stelle geändert – aktualisiert.', 'info', 6000);
  };
  speicher.onGespeichert = serverMetaUebernehmen;

  try {
    const { konto } = await api.sitzung();
    await sitzungUebernehmen(konto, false);
  } catch (e) {
    if (e.status === 0) {
      startFehler('Server nicht erreichbar',
        'Läuft der Server noch? Auf dem Server-Rechner muss <strong>Start-Server.bat</strong> offen sein.<br><br>'
        + 'Prüfe außerdem, ob die Adresse in der Adressleiste stimmt.');
      return;
    }
    loginZeigen();
  }
}

function loginZeigen(nachricht) {
  const body = leeren(startBereich());

  const benutzerInput = el('input', { type: 'text', autocomplete: 'username', placeholder: 'Benutzername' });
  const passwortInput = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Passwort' });
  const fehlerBox = el('div.startup-err', { style: 'display:none' });

  const absenden = async () => {
    fehlerBox.style.display = 'none';
    if (!benutzerInput.value.trim() || !passwortInput.value) return;
    submitBtn.disabled = true;
    try {
      const { konto } = await api.anmelden(benutzerInput.value.trim(), passwortInput.value);
      // Eine SPA behaelt den Hash ueber einen Login-Wechsel hinweg – ohne
      // das wuerde eine frisch angemeldete Person auf der zuletzt von wem
      // auch immer offenen Ansicht landen statt beim Dashboard.
      if (location.hash) history.replaceState(null, '', location.pathname);
      await sitzungUebernehmen(konto, true);
    } catch (e) {
      fehlerBox.textContent = e.message;
      fehlerBox.style.display = '';
      submitBtn.disabled = false;
      passwortInput.value = '';
      passwortInput.focus();
    }
  };

  benutzerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') passwortInput.focus(); });
  passwortInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') absenden(); });

  const submitBtn = el('button.btn.btn-primary.btn-lg', { type: 'button', onclick: absenden }, ['Anmelden']);

  body.append(
    el('div.field', {}, [el('label', { text: 'Benutzername' }), benutzerInput]),
    el('div.field', { style: 'margin-top: 10px' }, [el('label', { text: 'Passwort' }), passwortInput]),
    fehlerBox,
    el('div', { style: 'margin-top: 16px' }, [submitBtn]),
    el('div.startup-hint', {
      text: 'Zugangsdaten bekommst du von deiner Verwaltung. Die Verbindung läuft im internen Netz – '
        + 'nicht über das offene Internet.',
    }),
  );
  if (nachricht) toast(nachricht, 'info', 5000);
  benutzerInput.focus();
}

async function sitzungUebernehmen(konto, wechselErlauben) {
  sitzungGesetzt(konto);
  if (konto.wechselNoetig) {
    if (!wechselErlauben) { sitzungVerworfen(); loginZeigen(); return; }
    const ok = await passwortWechselErzwingen();
    if (!ok) { sitzungVerworfen(); loginZeigen(); return; }
  }
  await ladenUndAnzeigen();
}

function passwortWechselErzwingen() {
  const neu = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Neues Passwort' });
  const wdh = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Wiederholen' });
  const hinweisBox = el('div.hint', { text: 'Mindestens 6 Zeichen.' });

  return modal({
    titel: 'Neues Passwort vergeben',
    beschreibung: 'Dieses Konto wurde gerade eingerichtet oder zurückgesetzt. Bitte ein eigenes Passwort setzen, bevor es weitergeht.',
    inhalt: el('div', { style: 'display:grid;gap:10px' }, [
      el('div.field', {}, [el('label', { text: 'Neues Passwort' }), neu]),
      el('div.field', {}, [el('label', { text: 'Wiederholen' }), wdh]),
      hinweisBox,
    ]),
    buttons: [
      { text: 'Abmelden', wert: false },
      {
        text: 'Übernehmen', klasse: 'btn-primary', wert: '\0',
        vorAbschluss: () => {
          if (neu.value.length < 6) {
            hinweisBox.textContent = 'Mindestens 6 Zeichen.';
            hinweisBox.style.color = 'var(--neg)';
            return false;
          }
          if (neu.value !== wdh.value) {
            hinweisBox.textContent = 'Stimmt nicht überein.';
            hinweisBox.style.color = 'var(--neg)';
            return false;
          }
          return true;
        },
      },
    ],
  }).then(async (v) => {
    if (v !== '\0') return false;
    try {
      await api.passwortAendern(neu.value);
      toast('Passwort geändert', 'ok');
      return true;
    } catch (e) {
      toast('Passwort konnte nicht geändert werden: ' + e.message, 'err', 6000);
      return false;
    }
  });
}

/** Nach Anmeldung, nach Wechsel des betrachteten Mitarbeiters: laedt den
    passenden Datensatz und zeigt die App. Beim allerersten Aufruf – #app
    ist noch verborgen – laeuft der Ladeschritt im Startbildschirm, danach
    still im Hintergrund. */
async function ladenUndAnzeigen() {
  const ersteAnzeige = $('#app').hidden;
  if (ersteAnzeige) {
    const body = leeren(startBereich());
    body.append(el('div.spinner'));
  }

  try {
    // Parallel laden: die Stammdaten braucht die Erfassung schon fuer den
    // allerersten Render (Projektspalte), ein Fehlschlag dort soll aber
    // nicht den Zugriff auf die eigenen Stunden verhindern.
    const [daten0] = await Promise.all([
      datenLesen(betrachteteId()),
      stammdatenLaden().catch((e) => console.warn('Stammdaten konnten nicht geladen werden:', e.message)),
    ]);
    let daten = daten0;
    if (!daten) {
      daten = neueDaten(sitzung.konto.name);
      laden(daten);
      await sofortSpeichern();
    } else {
      laden(daten);
    }
    appStarten();
  } catch (e) {
    if (ersteAnzeige) {
      startFehler('Daten konnten nicht geladen werden', e.message || String(e));
      startBereich().append(el('button.btn', { type: 'button', style: 'margin-top:12px', onclick: () => location.reload() }, ['Neu starten']));
    } else {
      toast('Daten konnten nicht geladen werden: ' + e.message, 'err', 6000);
    }
  }
}

async function abmeldenKlick() {
  // Anders als beforeunload feuert bei einem Klick auf „Abmelden" kein
  // Browser-Ereignis, das eine ausstehende Autospeicherung noch erzwingt –
  // ohne diesen Schritt gaenge die letzte, noch nicht gespeicherte Eingabe
  // stillschweigend verloren.
  if (speicher.status === 'dirty' || speicher.status === 'saving') {
    try { await sofortSpeichern(); } catch { /* wird als Fehler angezeigt, Abmelden trotzdem fortsetzen */ }
  }
  try { await api.abmelden(); } catch { /* egal, lokal wird trotzdem abgemeldet */ }
  zurueckZurAnmeldung('Abgemeldet');
}

function abgemeldetBehandeln() {
  if (!sitzung.konto) return; // schon abgemeldet, keine doppelte Behandlung
  zurueckZurAnmeldung('Sitzung abgelaufen – bitte erneut anmelden.');
}

function zurueckZurAnmeldung(nachricht) {
  sitzungVerworfen();
  state.daten = null;
  $('#app').hidden = true;
  $('#startup').hidden = false;
  loginZeigen(nachricht);
}

/* ---------- Einzelplatz: Ablage waehlen ---------- */

/**
 * Service Worker anmelden – nur im Einzelplatz und nur im sicheren Kontext,
 * den der Browser dafuer verlangt. Scheitert das, laeuft die App einfach
 * ohne Offline-Faehigkeit weiter.
 */
function offlineVorbereiten() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  /* Uebernimmt ein neuer Service Worker, laufen die bereits geladenen Module
     noch aus der alten Fassung – einmal neu laden holt sie. Beim allerersten
     Besuch gab es keinen alten: die Module kamen frisch aus dem Netz, und ein
     Neuladen risse nur den Startbildschirm unter dem Finger weg. */
  const hatteVorgaenger = !!navigator.serviceWorker.controller;
  let neugeladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hatteVorgaenger || neugeladen) return;
    neugeladen = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js')
    .then((reg) => reg.update())
    .catch((e) => console.warn('Offline-Betrieb nicht verfügbar:', e.message));
}

async function einzelStarten() {
  offlineVorbereiten();
  $('.startup-sub').textContent = 'Arbeitszeiten erfassen, Überstunden und Urlaub im Blick behalten – '
    + 'für dich allein, ohne Server.';

  if (!istUnterstuetzt()) {
    startFehler('Browser zu alt',
      'Die App braucht IndexedDB, um Daten zu speichern. Das kann jeder aktuelle Browser – '
      + 'bitte aktualisiere deinen Browser und öffne die App erneut.');
    return;
  }

  /* Kommen wir gerade von der Dropbox-Anmeldung zurueck? Dann zuerst den
     Code einloesen – sonst stuende die App vor einer Ablage, bei der sie
     sich noch nicht ausweisen kann. */
  if (dbx.rueckkehrErkannt()) {
    leeren(startBereich()).append(el('div.spinner'));
    try {
      if (await dbx.anmeldungAbschliessen()) {
        await verbinden({ kennung: 'dropbox', ziel: { kennung: 'dropbox' }, name: 'Dropbox' });
        return;
      }
    } catch (e) {
      startFehler('Dropbox-Anmeldung fehlgeschlagen', dbx.fehlerKlartext(e).text);
      startBereich().append(el('button.btn', {
        type: 'button', style: 'margin-top:12px', onclick: () => startAuswahlZeigen(null),
      }, ['Zurück']));
      return;
    }
  }

  let gemerkt = null;
  try { gemerkt = await gemerkteAblage(); } catch { /* ignorieren */ }
  startAuswahlZeigen(gemerkt);
}

function startAuswahlZeigen(gemerkt) {
  const body = leeren(startBereich());
  const mitOrdner = verfuegbareAblagen().some((a) => a.kennung === 'ordner');

  if (gemerkt) {
    const symbol = { ordner: '📁', dropbox: '☁️', lokal: '📱' }[gemerkt.kennung] || '📁';
    body.append(el('div.startup-recent', {}, [
      el('div', { style: 'font-size:19px' }, [symbol]),
      el('div', { style: 'min-width:0' }, [
        el('div.rec-name', { text: gemerkt.name }),
        el('div.rec-path', { text: 'zuletzt verwendet' }),
      ]),
    ]));
    body.append(el('button.btn.btn-primary.btn-lg', {
      type: 'button', onclick: () => verbinden(gemerkt),
    }, ['Öffnen']));
    body.append(el('button.btn.btn-ghost', {
      type: 'button', onclick: () => startAuswahlZeigen(null),
    }, ['Andere Ablage wählen']));
    andereDropboxAppAnbieten(body);
    return;
  }

  if (mitOrdner) {
    body.append(el('button.btn.btn-primary.btn-lg', { type: 'button', onclick: () => ordnerDialog() }, ['Ordner wählen']));
    body.append(el('button.btn', { type: 'button', onclick: () => dropboxStarten() }, ['Mit Dropbox verbinden']));
    body.append(el('button.btn.btn-ghost', { type: 'button', onclick: () => lokalStarten() }, ['Nur auf diesem Gerät']));
    body.append(el('div.startup-hint', {
      text: 'Im gewählten Ordner speichert die App stunden.json und tägliche Sicherungen. Liegt dort schon '
        + 'eine stunden.json, wird sie geöffnet. Mit Dropbox siehst du auf allen Geräten denselben Stand.',
    }));
  } else {
    /* Safari und damit jeder Browser auf iPhone und iPad: kein Ordnerzugriff. */
    body.append(el('button.btn.btn-primary.btn-lg', { type: 'button', onclick: () => dropboxStarten() }, ['Mit Dropbox verbinden']));
    body.append(el('button.btn', { type: 'button', onclick: () => lokalStarten() }, ['Nur auf diesem Gerät']));
    body.append(el('div.startup-hint', {
      text: 'Dieser Browser kann nicht auf einen Ordner zugreifen. Über Dropbox siehst du auf allen '
        + 'Geräten denselben Stand; „Nur auf diesem Gerät" speichert ohne Abgleich im Browser.',
    }));
  }

  andereDropboxAppAnbieten(body);

  /* Die Warnung lohnt hier nur, wo sie wirklich draengt – auf iPhone und iPad. */
  const warnung = aufApple() ? speicherWarnung() : null;
  if (warnung) body.append(el('div.startup-hint', { html: warnung }));
}

/* Besteht schon ein Dropbox-Zugang, geht „Mit Dropbox verbinden" bzw.
   „Öffnen" direkt damit los. Wer eine andere Dropbox-App nehmen oder sich
   neu anmelden will, braucht einen eigenen Weg zur Abfrage des App keys. */
function andereDropboxAppAnbieten(body) {
  dbx.angemeldet().then((ja) => {
    if (!ja || !body.isConnected) return;
    body.append(el('button.btn.btn-ghost', {
      type: 'button', style: 'font-size:12px', onclick: () => dropboxNeuAnmelden(),
    }, ['Andere Dropbox-App verwenden …']));
  });
}

async function ordnerDialog() {
  let auswahl;
  try {
    auswahl = await ablageWaehlen('ordner');
  } catch (e) {
    if (e.name !== 'AbortError') toast('Ordner konnte nicht geöffnet werden: ' + e.message, 'err');
    return;
  }
  await verbinden({ ...auswahl, name: auswahl.ziel.name });
}

async function lokalStarten() {
  const auswahl = await ablageWaehlen('lokal');
  await verbinden({ ...auswahl, name: 'Dieses Gerät' });
}

/**
 * Gespeicherten Zugang verwerfen und neu anmelden. Die Abfrage des App keys
 * erscheint dabei vorausgefuellt – wer zu einer anderen Dropbox-App wechseln
 * will, traegt dort deren Key ein. Der Zwischenspeicher dieses Geraets
 * bleibt; nur die Merker des Abgleichs werden geloescht, weil sie zur alten
 * App gehoeren und sonst einen Scheinkonflikt erzeugten.
 */
async function dropboxNeuAnmelden() {
  await dbx.abmelden();
  await kvDel('dropboxRev');
  await kvDel('dropboxStand');
  await dropboxAnmelden();
}

async function dropboxStarten() {
  if (await dbx.angemeldet()) {
    await verbinden({ kennung: 'dropbox', ziel: { kennung: 'dropbox' }, name: 'Dropbox' });
    return;
  }
  await dropboxAnmelden(); // verlaesst bei Erfolg die Seite
}

async function verbinden(auswahl) {
  leeren(startBereich()).append(el('div.spinner'));

  try {
    if (!(await rechtePruefen(auswahl))) {
      startFehler('Zugriff verweigert', auswahl.kennung === 'dropbox'
        ? 'Die Dropbox-Anmeldung ist nicht mehr gültig. Bitte neu verbinden.'
        : 'Ohne Schreibrecht auf den Ordner können die Zeiten nicht geladen werden.');
      startBereich().append(el('button.btn', {
        type: 'button', style: 'margin-top:12px', onclick: () => startAuswahlZeigen(null),
      }, ['Zurück']));
      return;
    }

    await ablageUebernehmen(auswahl);
    /* Bei Dropbox zuerst nachsehen, ob drueben schon Zeiten liegen –
       sonst legte jedes neue Geraet einen zweiten, leeren Stand an. */
    if (auswahl.kennung === 'dropbox') await erstbezug();
    let daten = await datenLesen();

    if (!daten) {
      const wo = {
        ordner: `Im Ordner „${auswahl.name}" liegt noch keine stunden.json.`,
        dropbox: 'In deiner Dropbox liegt noch keine stunden.json.',
        lokal: 'Auf diesem Gerät sind noch keine Zeiten gespeichert.',
      }[auswahl.kennung];
      daten = await neuOderUebernehmen(wo);
      if (!daten) { startAuswahlZeigen(null); return; }
      laden(daten);
      await sofortSpeichern();
      toast('Gespeichert', 'ok');
    } else {
      laden(daten);
    }

    await ablageMerken(auswahl);
    appStarten();
    anzeigeAnmelden(() => { chromeAktualisieren(); routen(); });
    abgleichAnbinden();
  } catch (e) {
    console.error(e);
    const klar = auswahl.kennung === 'dropbox' ? dbx.fehlerKlartext(e) : { text: e.message || String(e) };
    startFehler('Daten konnten nicht geladen werden', klar.text);
    if (auswahl.kennung === 'dropbox') {
      /* Bei jedem Dropbox-Fehler den Weg zu einer frischen Anmeldung
         anbieten – auch mit anderem App key. Ein neuer Versuch mit demselben
         Zugang nuetzt bei Zugangsproblemen nichts: Rechte, die bei Dropbox
         erst nachtraeglich gesetzt wurden, gelten nur fuer eine *neue*
         Anmeldung. Und ohne diesen Knopf saesse man hier fest, denn der
         Weg ueber die Einstellungen setzt eine geladene App voraus. */
      startBereich().append(el('button.btn' + (klar.neuAnmelden ? '.btn-primary' : ''), {
        type: 'button', style: 'margin-top:12px',
        onclick: () => dropboxNeuAnmelden(),
      }, ['Bei Dropbox neu anmelden']));
    }
    startBereich().append(el('button.btn', {
      type: 'button', style: 'margin-top:8px', onclick: () => startAuswahlZeigen(null),
    }, ['Zurück']));
  }
}

/**
 * Die Ablage ist leer: neu anfangen oder vorhandene Zeiten mitbringen –
 * etwa den Export aus dem Team-Betrieb oder aus einer anderen Ablage.
 * Liefert den Datensatz oder null bei Abbruch.
 */
async function neuOderUebernehmen(wo) {
  const name = el('input', { type: 'text', placeholder: 'z. B. Max Mustermann' });
  const datei = dateiFeld();
  const fehler = el('div', { style: 'font-size:12px;color:var(--neg)' });

  const wert = await modal({
    titel: 'Neu anfangen',
    beschreibung: wo,
    inhalt: el('div', { style: 'display:grid;gap:14px' }, [
      el('div.field', {}, [el('label', { text: 'Dein Name – für einen leeren Datensatz' }), name]),
      el('div.field', {}, [
        el('label', { text: 'Oder vorhandene Zeiten übernehmen (.json aus „Als Datei exportieren")' }),
        datei.element,
      ]),
      fehler,
    ]),
    buttons: [
      { text: 'Abbrechen', wert: null },
      {
        text: 'Weiter', klasse: 'btn-primary', wert: '\0',
        vorAbschluss: () => {
          if (datei.daten() || name.value.trim()) return true;
          fehler.textContent = 'Bitte einen Namen eintragen oder eine Datei wählen.';
          return false;
        },
      },
    ],
  });
  if (wert !== '\0') return null;
  return datei.daten() || neueDaten(name.value.trim());
}

/* ---------- App ---------- */

let gestartet = false;

function appStarten() {
  if (!gestartet) {
    gestartet = true;

    speicher.onStatus = statusAnzeigen;
    statusAnzeigen('idle');

    abonnieren(chromeAktualisieren);

    $('#themeToggle').addEventListener('click', () => {
      themaSetzen(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    $('#btnFolder').addEventListener('click', () => { location.hash = '#/einstellungen'; });
    $('#btnAbmelden').addEventListener('click', abmeldenKlick);
    // Im Einzelplatz gibt es niemanden abzumelden.
    $('#btnAbmelden').hidden = istEinzel();
    $('#btnFolder').title = istEinzel() ? 'Speicherort – siehe Einstellungen' : 'Konto und Server – siehe Einstellungen';
    if (istEinzel()) {
      $('#btnFolder svg').innerHTML = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';
    }

    window.addEventListener('hashchange', routen);
    window.addEventListener('beforeunload', (e) => {
      if (speicher.status === 'dirty' || speicher.status === 'saving') {
        sofortSpeichern();
        e.preventDefault();
        e.returnValue = '';
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && speicher.status === 'dirty') sofortSpeichern();
    });
  }

  $('#startup').hidden = true;
  $('#app').hidden = false;

  navAufbauen();
  mitarbeiterSwitchAufbauen();
  chromeAktualisieren();
  routen();
}

function navAufbauen() {
  const nav = leeren($('#nav'));
  for (const key of reihenfolge()) {
    if (key === 'einstellungen') nav.append(el('div', { style: 'flex:1' }));
    const cfg = ANSICHTEN[key];
    nav.append(el('a.nav-item', { href: '#/' + key, dataset: { key } }, [
      el('span', { html: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>`, style: 'display:flex' }),
      el('span', { text: cfg.navTitel || cfg.titel }),
      cfg.zaehler ? el('span.nav-badge', { dataset: { badge: key } }) : null,
    ]));
  }
}

/** Nur fuer den Admin gefuellt: Umschalter zwischen den Mitarbeitern in der Kopfzeile. */
async function mitarbeiterSwitchAufbauen() {
  const box = leeren($('#mitarbeiterSwitch'));
  if (!istAdmin()) return;

  let liste;
  try { ({ konten: liste } = await api.team()); } catch { return; }

  for (const k of liste.filter((x) => x.aktiv)) {
    box.append(el('button' + (betrachteteId() === k.id ? '.aktiv' : ''), {
      type: 'button',
      text: k.id === eigeneId() ? 'Ich' : (k.name.split(' ')[0] || k.benutzer),
      title: k.name,
      onclick: () => mitarbeiterWechseln(k.id),
    }));
  }
}

async function mitarbeiterWechseln(kontoId) {
  if (kontoId === betrachteteId()) return;
  if (speicher.status === 'dirty' || speicher.status === 'saving') {
    try { await sofortSpeichern(); } catch { /* wird unten sichtbar */ }
  }
  betrachtenSetzen(kontoId);
  await ladenUndAnzeigen();
}

function chromeAktualisieren() {
  const d = state.daten;
  if (!d) return;
  $('#datenName').textContent = d.meta.name;

  const hinweis = $('#betrachtungHinweis');
  if (istAdmin() && !betrachtetSichSelbst()) {
    hinweis.textContent = 'Ansicht: ' + d.meta.name;
    hinweis.hidden = false;
  } else {
    hinweis.hidden = true;
  }

  const version = $('#version');
  if (version) version.textContent = `v2.1 · ${istEinzel() ? 'Einzelplatz' : 'Team'} · Schema ${d.schemaVersion}`;
  $('#folderName').textContent = istEinzel() ? (speicher.ablageName || 'Ablage') : (sitzung.konto?.name || 'Konto');

  // Der Titel kann von den Daten abhaengen, deshalb hier erneut setzen
  const key = (location.hash.replace(/^#\//, '') || reihenfolge()[0]).split('?')[0];
  const cfg = ANSICHTEN[key];
  if (cfg) $('#viewTitle').textContent = typeof cfg.titel === 'function' ? cfg.titel() : cfg.titel;

  document.title = d.meta.name + ' – StundenKompass';
  for (const k of reihenfolge()) {
    const c = ANSICHTEN[k];
    if (!c.zaehler) continue;
    const badge = document.querySelector(`[data-badge="${k}"]`);
    if (badge) {
      const n = c.zaehler(d);
      badge.textContent = n > 0 ? String(n) : '';
    }
  }
}

function statusAnzeigen(status, detail) {
  const box = $('#saveStatus');
  if (!box) return;
  box.dataset.state = status;
  const label = box.querySelector('.label');
  const texte = {
    idle: detail instanceof Date ? 'Gespeichert ' + detail.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'Gespeichert',
    dirty: 'Nicht gespeichert',
    saving: 'Speichert …',
    konflikt: 'Aktualisiert',
    error: 'Fehler beim Speichern',
  };
  label.textContent = texte[status] || '';
  if (status === 'error') {
    toast(istEinzel()
      ? 'Speichern fehlgeschlagen. Ist der Ordner noch erreichbar? Siehe Einstellungen.'
      : 'Speichern fehlgeschlagen. Läuft der Server noch?', 'err', 7000);
  }
}

function routen() {
  const erlaubt = reihenfolge();
  const angefragt = (location.hash.replace(/^#\//, '') || erlaubt[0]).split('?')[0];
  const key = erlaubt.includes(angefragt) ? angefragt : erlaubt[0];
  const cfg = ANSICHTEN[key];

  for (const a of document.querySelectorAll('.nav-item')) {
    a.classList.toggle('active', a.dataset.key === (cfg.navKey || key));
  }
  $('#viewTitle').textContent = typeof cfg.titel === 'function' ? cfg.titel() : cfg.titel;

  const container = leeren($('#view'));
  container.scrollTop = 0;
  cfg.view.render(container);
}

starten();
