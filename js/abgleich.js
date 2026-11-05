/* Steuerung des Dropbox-Abgleichs (nur Einzelplatz): wann abgeglichen wird,
   was bei einem Konflikt passiert, wie der Zustand in der Kopfzeile aussieht
   – und der Dialog, der den App key abfragt.

   Eigenes Modul, weil zwei Seiten es brauchen – main.js beim Start und die
   Einstellungen fuer „Jetzt abgleichen" und „Mit Dropbox verbinden". Ein
   Import aus main.js waere ein Zirkelbezug.

   Was die Ansicht neu zeichnet, weiss dieses Modul nicht; main.js meldet es
   ueber anzeigeAnmelden() an. Dasselbe Muster wie datenquelle() in storage.js. */

import { $, el, toast, modal, datum } from './util.js';
import { hinweis } from './felder.js';
import { laden, abonnieren } from './store.js';
import {
  abgleichMoeglich, abgleichen, konfliktHierBehalten, konfliktDortBehalten,
} from './storage.js';
import * as dbx from './speicher/dropboxApi.js';

let neuZeichnen = () => {};

export function anzeigeAnmelden(fn) {
  neuZeichnen = fn;
}

let laeuft = false;
let angebunden = false;

/**
 * Wann abgeglichen wird: beim Start, bei der Rueckkehr zur App, wenn das
 * Netz wiederkommt, und traege nach Aenderungen. Letzteres bewusst traege –
 * waehrend des Tippens staendig hochzuladen braucht niemand und erzeugt nur
 * Konflikte mit dem zweiten Geraet.
 */
export function anbinden() {
  if (!abgleichMoeglich()) return;
  jetztAbgleichen(true);
  if (angebunden) return;
  angebunden = true;

  let timer = null;
  abonnieren(() => {
    if (!abgleichMoeglich()) return;
    clearTimeout(timer);
    timer = setTimeout(() => jetztAbgleichen(true), 8000);
  });
  window.addEventListener('online', () => jetztAbgleichen(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') jetztAbgleichen(true);
  });
  $('#syncStatus')?.addEventListener('click', () => jetztAbgleichen(false));
}

/** `leise` unterdrueckt Erfolgsmeldungen – fuer die automatischen Laeufe. */
export async function jetztAbgleichen(leise = false) {
  if (laeuft || !abgleichMoeglich()) return;

  if (!navigator.onLine) {
    zustandZeigen('offline');
    if (!leise) toast('Kein Netz – der Abgleich holt das nach, sobald du wieder online bist.', 'info');
    return;
  }

  laeuft = true;
  zustandZeigen('laeuft');
  try {
    const e = await abgleichen();

    if (e.art === 'konflikt') {
      zustandZeigen('konflikt');
      await konfliktKlaeren(e);
      return;
    }

    if (e.art === 'geholt') {
      laden(e.daten);
      neuZeichnen();
      toast('Neuerer Stand aus Dropbox übernommen', 'ok');
    } else if (!leise) {
      toast(e.art === 'nichts' ? 'Alles aktuell' : 'Zu Dropbox übertragen', 'ok');
    }
    zustandZeigen('fertig');
  } catch (err) {
    console.error('Abgleich fehlgeschlagen:', err);
    zustandZeigen('fehler');
    const { text } = dbx.fehlerKlartext(err);
    toast('Abgleich fehlgeschlagen: ' + text, 'err', 8000);
  } finally {
    laeuft = false;
  }
}

/**
 * Der Konfliktfall: beide Seiten haben sich seit dem letzten Abgleich
 * bewegt. Es wird nicht geraten – der Nutzer sieht beide Fassungen und
 * entscheidet. Die unterlegene bleibt in jedem Fall als Sicherung.
 */
async function konfliktKlaeren(e) {
  const spalte = (titel, s, hier) => el('div', {
    style: 'border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px',
  }, [
    el('div', { text: titel, style: 'font-weight:600;margin-bottom:8px' }),
    el('div.faint', { style: 'font-size:12.5px;display:grid;gap:3px' }, [
      el('div', { text: `zuletzt geändert: ${s.geaendertAm ? datum(s.geaendertAm) : 'unbekannt'}` }),
      el('div', { text: `auf Gerät: ${s.geraet || 'unbekannt'}` }),
      el('div', { text: `${s.tage} Tage erfasst${s.letzterTag ? ', bis ' + datum(s.letzterTag) : ''}` }),
      el('div', { text: `${s.stand} Änderungen insgesamt` }),
    ]),
    hier ? el('div.badge.blau', { text: 'dieses Gerät', style: 'margin-top:8px' }) : null,
  ]);

  const inhalt = el('div', { style: 'display:grid;gap:12px' }, [
    hinweis('<strong>Beide Seiten wurden geändert.</strong> Die Stände lassen sich nicht '
      + 'zuverlässig zusammenführen – entscheide, welcher gelten soll. Der andere wird als Sicherung '
      + 'behalten und ist unter <em>Einstellungen → Sicherungen</em> wiederherstellbar.'),
    el('div.konflikt-paar', {}, [
      spalte('Hier', e.hier, true),
      spalte('In Dropbox', e.dort, false),
    ]),
  ]);

  const wahl = await modal({
    titel: 'Unterschiedliche Stände', inhalt, breite: 600,
    buttons: [
      { text: 'Später entscheiden', wert: null },
      { text: 'Dropbox übernehmen', wert: 'dort' },
      { text: 'Diesen Stand behalten', klasse: 'btn-primary', wert: 'hier' },
    ],
  });

  if (!wahl) {
    toast('Abgleich zurückgestellt – bis dahin bleiben beide Stände getrennt.', 'info', 6000);
    return;
  }

  try {
    if (wahl === 'hier') {
      await konfliktHierBehalten(e.fremdRev);
      toast('Dein Stand gilt jetzt auch in Dropbox', 'ok');
    } else {
      const r = await konfliktDortBehalten(e.fremdDaten, e.fremdRev);
      laden(r.daten);
      neuZeichnen();
      toast('Stand aus Dropbox übernommen', 'ok');
    }
    zustandZeigen('fertig');
  } catch (err) {
    zustandZeigen('fehler');
    toast('Konflikt konnte nicht aufgelöst werden: ' + dbx.fehlerKlartext(err).text, 'err', 8000);
  }
}

export function zustandZeigen(zustand) {
  const box = $('#syncStatus');
  if (!box) return;
  box.hidden = !zustand;
  if (!zustand) return;
  box.dataset.state = zustand;
  const texte = {
    laeuft: 'Gleicht ab …',
    fertig: 'Abgeglichen',
    offline: 'Offline',
    konflikt: 'Stände weichen ab',
    fehler: 'Abgleich gestört',
  };
  box.querySelector('.label').textContent = texte[zustand] || '';
}

/* ---------- Einrichtung ---------- */

/**
 * Fragt den App key ab und erklaert, wo er herkommt. Der Key ist bei PKCE
 * ausdruecklich oeffentlich – er benennt die App, er berechtigt zu nichts.
 * Die Redirect-URI wird angezeigt, weil sie bei Dropbox auf das Zeichen
 * genau eingetragen sein muss. Liefert true, wenn ein Key gespeichert wurde.
 */
export async function appKeyAbfragen() {
  const uri = dbx.redirectUri();
  const input = el('input', {
    type: 'text', value: (await dbx.appKeyLesen()) || '',
    placeholder: 'z. B. a1b2c3d4e5f6g7h',
    autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
  });
  const meldung = el('div.hint', { style: 'color:var(--neg)' });
  const inhalt = el('div', { style: 'display:grid;gap:12px' }, [
    hinweis('<strong>Einmalige Einrichtung bei Dropbox.</strong> Lege auf '
      + '<em>dropbox.com/developers/apps</em> eine App an: <em>Scoped access</em>, '
      + '<em>App folder</em>, Name etwa „StundenKompass". Im Reiter <em>Permissions</em> die Rechte '
      + '<em>files.content.read</em> und <em>files.content.write</em> setzen und speichern.'),
    el('div.field', {}, [
      el('label', { text: 'Redirect-URI – im Reiter „Settings" unter „Redirect URIs" eintragen' }),
      el('div.readonly', { text: uri, style: 'user-select:all;word-break:break-all' }),
    ]),
    el('div.field', {}, [
      el('label', { text: 'App key – Reiter „Settings", Feld „App key"' }),
      input,
      el('div.hint', { text: 'Nicht das darunterstehende „App secret" – das wird hier nicht '
        + 'gebraucht. Der App key ist nicht geheim, er benennt nur die App. Dein Zugang '
        + 'entsteht erst bei der Anmeldung und bleibt auf diesem Gerät.' }),
    ]),
    meldung,
  ]);

  for (;;) {
    const wert = await modal({
      titel: 'Dropbox einrichten', inhalt, breite: 560,
      buttons: [
        { text: 'Abbrechen', wert: null },
        { text: 'Weiter zur Anmeldung', klasse: 'btn-primary', wert: '\0' },
      ],
    });
    if (wert !== '\0') return false;

    const key = input.value.trim();
    /* Dropbox-App-Keys bestehen aus Buchstaben und Ziffern. Ein Leerzeichen
       oder ein mitkopiertes „App key:" faellt hier auf – sonst erst drueben
       mit „invalid client_id", und dann weiss niemand, woran es lag. */
    const fehler = !key ? 'Bitte den App key eintragen.'
      : /\s/.test(key) ? 'Der App key enthält ein Leerzeichen. Bitte nur die Zeichenfolge selbst einfügen.'
      : !/^[A-Za-z0-9]+$/.test(key) ? 'Der App key besteht nur aus Buchstaben und Ziffern – hier stehen andere Zeichen.'
      : null;
    if (fehler) { meldung.textContent = fehler; continue; }

    await dbx.appKeySetzen(key);
    return true;
  }
}

/**
 * Startet die Anmeldung bei Dropbox. Verlaesst die Seite; zurueck kommt man
 * ueber main.js, das den Code in der Adresse erkennt. Liefert false, wenn
 * es gar nicht erst losging.
 */
export async function dropboxAnmelden() {
  if (!window.isSecureContext) {
    toast('Dropbox braucht HTTPS. Über http:// erlaubt der Browser die nötige Verschlüsselung nicht.', 'err', 8000);
    return false;
  }
  /* Solange nicht angemeldet ist, wird der App key jedes Mal gezeigt –
     vorausgefuellt und aenderbar. Erschiene er nur beim ersten Mal, saesse
     man mit einem Tippfehler fest. */
  if (!(await appKeyAbfragen())) return false;
  try {
    await dbx.anmeldungStarten();
    return true;
  } catch (e) {
    toast(e.message, 'err', 7000);
    return false;
  }
}
