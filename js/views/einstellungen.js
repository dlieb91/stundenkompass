/* Einstellungen – je nach Betriebsart (betrieb.js):

     team     eigenes Konto, Server, Sicherungen auf dem Server (Admin)
     einzel   Speicherort (Ordner, Dropbox, Geraet), Export und Import,
              Sicherungen in der eigenen Ablage

   Dazu in beiden Faellen Name und Aenderungsprotokoll.
*/

import {
  el, leeren, num, datum, toast, bestaetigen, abfragen, modal,
} from '../util.js';
import { abschnitt, hinweis } from '../felder.js';
import {
  state, aendern, laden, protokollEintraege,
} from '../store.js';
import {
  speicher, sofortSpeichern, alsDateiSichern, backupsAuflisten, backupLesen,
  ablageVergessen, dropboxTrennen, geraetedatenLoeschen, abgleichStatus,
} from '../storage.js';
import {
  sitzung, istAdmin, betrachteteId, betrachtetSichSelbst,
} from '../sitzung.js';
import { istEinzel } from '../betrieb.js';
import { aktuell as stammdatenAktuell } from '../stammdaten.js';
import { speicherWarnung } from '../speicher/lokal.js';
import { jetztAbgleichen } from '../abgleich.js';
import { dateiFeld, pruefen } from '../uebernahme.js';
import * as api from '../api.js';

export const einstellungen = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    const neu = () => { leeren(container); this.render(container); };

    inner.append(kopfKarte(neu));
    if (istEinzel()) {
      inner.append(ablageKarte(neu));
      inner.append(dateiKarte(neu));
      inner.append(ablageSicherungKarte(neu));
    } else {
      inner.append(kontoKarte());
      if (istAdmin()) inner.append(sicherungKarte(neu));
    }
    inner.append(protokollKarte());
  },
};

/* ---------- Export (beide Betriebsarten) ---------- */

/**
 * Laedt den offenen Datensatz als .json herunter. Kunden und Projekte gehen
 * mit – im Team liegen sie sonst nur auf dem Server, und wer seine Zeiten in
 * den Einzelplatz mitnimmt, braeuchte sie dort, damit die Buchungen ihre
 * Projekte wiederfinden.
 */
function exportieren() {
  const d = state.daten;
  const sd = stammdatenAktuell();
  const mit = sd ? { ...d, stammdaten: { projektpflicht: !!sd.projektpflicht, kunden: sd.kunden || [], projekte: sd.projekte || [] } } : d;
  const name = String(d.meta.name || 'stunden').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '_');
  const tag = new Date().toISOString().slice(0, 10);
  alsDateiSichern(mit, `stundenkompass-${name}-${tag}.json`);
  toast('Datei heruntergeladen', 'ok');
}

/* ---------- Einzelplatz: Speicherort ---------- */

const ABLAGE_TEXT = {
  ordner: ['Ordner auf diesem Rechner', 'Die Zeiten liegen als stunden.json im gewählten Ordner, daneben die '
    + 'täglichen Sicherungen. Der Ordner darf in OneDrive oder Dropbox liegen.'],
  dropbox: ['Dropbox', 'Die App arbeitet im Speicher dieses Geräts und gleicht mit Dropbox ab – beim Start, '
    + 'bei der Rückkehr zur App, wenn das Netz wiederkommt und kurz nach jeder Änderung. Ohne Netz geht die '
    + 'Arbeit normal weiter.'],
  lokal: ['Auf diesem Gerät', null],
};

function ablageKarte(neu) {
  const [art, text] = ABLAGE_TEXT[speicher.kennung] || ['–', null];
  // Ordnername oder Dropbox-Konto; die Platzhalter „Dropbox"/„Dieses Gerät" wiederholten nur die Art.
  const zusatz = ['Dropbox', 'Dieses Gerät'].includes(speicher.ablageName) ? '' : speicher.ablageName;
  const karte = el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Speicherort' }),
        el('div.sub', { text: zusatz ? `${art} · ${zusatz}` : art }),
      ]),
      el('button.btn.btn-sm', {
        type: 'button',
        onclick: async () => { await sofortSpeichern(); toast('Gespeichert', 'ok'); },
      }, ['Jetzt speichern']),
    ]),
  ]);

  const body = el('div.card-body', { style: 'display:grid;gap:12px' });
  const warnung = speicher.kennung === 'lokal' ? speicherWarnung() : null;
  if (text) body.append(hinweis(text));
  if (warnung) body.append(hinweis(warnung));

  const knoepfe = el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' });

  if (speicher.kennung === 'dropbox') {
    const status = el('div', { style: 'font-size:12.5px;color:var(--text-faint)', text: 'Status wird ermittelt …' });
    body.append(status);
    abgleichStatus().then((s) => {
      status.textContent = [
        s.konto ? `Verbunden als ${s.konto}` : 'Verbunden',
        s.offeneAenderungen ? 'Änderungen warten auf den Abgleich' : 'alles abgeglichen',
        s.online ? null : 'gerade offline',
      ].filter(Boolean).join(' · ');
    }).catch(() => { status.textContent = ''; });

    knoepfe.append(
      el('button.btn.btn-sm', { type: 'button', onclick: async () => { await jetztAbgleichen(false); neu(); } }, ['Jetzt abgleichen']),
      el('button.btn.btn-sm.btn-danger', {
        type: 'button',
        onclick: async () => {
          const ok = await bestaetigen('Dropbox trennen',
            'Die Anmeldung und der Zwischenspeicher auf diesem Gerät werden entfernt. Die stunden.json in '
            + 'deiner Dropbox bleibt unberührt. Noch nicht abgeglichene Änderungen gehen verloren – vorher '
            + 'abgleichen oder als Datei exportieren.',
            { okText: 'Trennen', gefahr: true });
          if (!ok) return;
          await dropboxTrennen();
          location.reload();
        },
      }, ['Dropbox trennen']),
    );
  }

  knoepfe.append(el('button.btn.btn-sm', {
    type: 'button',
    onclick: async () => {
      const ok = await bestaetigen('Andere Ablage wählen',
        'Die App kehrt zum Startbildschirm zurück. Die Daten bleiben, wo sie sind. Willst du deinen Stand '
        + 'mitnehmen, exportiere ihn vorher als Datei und übernimm ihn in der neuen Ablage.',
        { okText: 'Zum Startbildschirm' });
      if (!ok) return;
      if (speicher.status === 'dirty' || speicher.status === 'saving') await sofortSpeichern();
      await ablageVergessen();
      location.reload();
    },
  }, ['Andere Ablage wählen']));

  if (speicher.kennung === 'lokal') {
    knoepfe.append(el('button.btn.btn-sm.btn-danger', {
      type: 'button',
      onclick: async () => {
        const ok = await bestaetigen('Daten von diesem Gerät löschen',
          'Alle Zeiten und Sicherungen im Speicher dieses Browsers werden gelöscht. Das lässt sich nicht '
          + 'rückgängig machen – vorher als Datei exportieren.',
          { okText: 'Endgültig löschen', gefahr: true });
        if (!ok) return;
        await geraetedatenLoeschen();
        location.reload();
      },
    }, ['Daten von diesem Gerät löschen']));
  }

  body.append(knoepfe);
  karte.append(body);
  return karte;
}

/* ---------- Einzelplatz: Export und Import ---------- */

function dateiKarte(neu) {
  return abschnitt('Als Datei', 'zum Mitnehmen, Sichern und Umziehen', [
    hinweis('Der Export enthält alle Zeiten, Vorgaben, Kunden und Projekte. Mit „Aus Datei übernehmen" '
      + 'holst du einen solchen Export herein – aus dem Team-Betrieb, von einem anderen Gerät oder aus einer '
      + 'anderen Ablage.'),
    el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, [
      el('button.btn.btn-sm', { type: 'button', onclick: exportieren }, ['Als Datei exportieren']),
      el('button.btn.btn-sm', { type: 'button', onclick: () => importieren(neu) }, ['Aus Datei übernehmen …']),
    ]),
  ]);
}

async function importieren(neu) {
  const datei = dateiFeld();
  const wert = await modal({
    titel: 'Aus Datei übernehmen',
    beschreibung: 'Der aktuelle Stand wird vollständig ersetzt. Er wird vorher als Sicherung abgelegt '
      + 'und ist darüber wiederherstellbar.',
    inhalt: datei.element,
    buttons: [
      { text: 'Abbrechen', wert: null },
      { text: 'Ersetzen', klasse: 'btn-danger', wert: '\0', vorAbschluss: () => !!datei.daten() },
    ],
  });
  if (wert !== '\0') return;
  ersetzen(datei.daten());
  toast('Übernommen', 'ok');
  neu();
}

/**
 * Ersetzt den offenen Stand. Ueber aendern(), nicht nur laden(): der
 * Zaehler muss steigen, sonst haelt der Dropbox-Abgleich die Uebernahme
 * fuer „nichts passiert" und holt beim naechsten Lauf den alten Stand zurueck.
 * letztesBackup ist geleert (siehe pruefen()), also sichert das naechste
 * Speichern den Stand davor.
 */
function ersetzen(daten) {
  laden(daten);
  aendern();
}

/* ---------- Einzelplatz: Sicherungen in der Ablage ---------- */

function ablageSicherungKarte(neu) {
  const karte = el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Sicherungen' }),
        el('div.sub', { text: speicher.kennung === 'ordner' ? 'im Unterordner backups' : 'im Speicher dieses Geräts' }),
      ]),
    ]),
  ]);
  const body = el('div.card-body', {}, [
    el('div', { text: 'Sicherungen werden geladen …', style: 'color:var(--text-faint);font-size:13px' }),
  ]);
  karte.append(body);

  backupsAuflisten().then((liste) => {
    leeren(body);
    body.append(hinweis(
      'Einmal täglich wird vor der ersten Änderung der bisherige Stand gesichert – die letzten 20 bleiben. '
      + (speicher.kennung === 'dropbox'
        ? 'Dazu kommen die Stände, die ein Dropbox-Abgleich ersetzt hat. '
        : '')
      + 'Vor dem Wiederherstellen wird der aktuelle Stand selbst gesichert.'
    ));
    if (!liste.length) {
      body.append(el('div.dim', { style: 'font-size:13px', text: 'Noch keine Sicherung vorhanden.' }));
      return;
    }
    body.append(el('div.plan-scroll', {}, [el('table.data.kompakt', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Sicherung' }),
        el('th', { style: 'text-align:right', text: 'Größe' }),
        el('th', { text: '' }),
      ])]),
      el('tbody', {}, liste.map((b) => el('tr', {}, [
        el('td', { text: sicherungName(b.name) }),
        el('td.num', { text: num(b.groesse / 1024, 1) + ' kB' }),
        el('td', { style: 'text-align:right' }, [
          el('button.btn.btn-sm', { type: 'button', onclick: () => ausSicherung(b.name, neu) }, ['Wiederherstellen']),
        ]),
      ]))),
    ])]));
  }).catch((e) => {
    leeren(body);
    body.append(el('div.startup-err', { text: 'Sicherungen konnten nicht gelesen werden: ' + e.message }));
  });
  return karte;
}

/** „stundenkompass-2026-11-04-09-12.json" → „04.11.2026, 09:12" (+ Art, wenn es keine Tagessicherung ist). */
function sicherungName(name) {
  const m = name.match(/^(.*?)-?(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.json$/);
  if (!m) return name;
  const art = { 'konflikt': ' · aus Dropbox-Konflikt', 'vor-abgleich': ' · vor Abgleich' }[m[1]] || '';
  return `${m[4]}.${m[3]}.${m[2]}, ${m[5]}:${m[6]}${art}`;
}

async function ausSicherung(name, neu) {
  const ok = await bestaetigen('Sicherung wiederherstellen',
    `Der aktuelle Stand wird zuvor gesichert. Danach gilt der Stand „${sicherungName(name)}".`,
    { okText: 'Wiederherstellen' });
  if (!ok) return;
  try {
    ersetzen(pruefen(await backupLesen(name)));
    await sofortSpeichern();
    toast('Sicherung wiederhergestellt', 'ok');
    neu();
  } catch (e) {
    toast('Wiederherstellen fehlgeschlagen: ' + e.message, 'err', 6000);
  }
}

/* ---------- Name und Zeitstempel ---------- */

function kopfKarte(neu) {
  const d = state.daten;
  return abschnitt('Allgemein', 'Name und Zeitstempel dieses Datensatzes', [
    el('div.summen', { style: 'margin-top:0' }, [
      summe('Name', d.meta.name),
      summe('Angelegt', datum(d.meta.erstelltAm)),
      summe('Zuletzt geändert', datum(d.meta.geaendertAm)),
    ]),
    el('div', { style: 'margin-top:16px' }, [
      el('button.btn.btn-sm', {
        type: 'button',
        onclick: async () => {
          const name = await abfragen('Umbenennen', 'Der Name erscheint in der Kopfzeile.',
            { label: 'Name', wert: d.meta.name });
          if (name === null || !name) return;
          aendern(() => { d.meta.name = name; });
          neu();
        },
      }, ['Umbenennen']),
    ]),
  ]);
}

function summe(label, wert) {
  return el('div.summe', {}, [
    el('div.summe-label', { text: label }),
    el('div.summe-wert', { text: wert, style: 'font-size:14px' }),
  ]);
}

/* ---------- Eigenes Konto ---------- */

function kontoKarte() {
  const k = sitzung.konto;
  const karte = el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Konto und Server' }),
        el('div.sub', { text: `Angemeldet als „${k.name}" (${k.benutzer}) · ${k.rolle === 'admin' ? 'Verwaltung' : 'Mitarbeiter'}` }),
      ]),
      el('button.btn.btn-sm', {
        type: 'button',
        onclick: async () => { await sofortSpeichern(); toast('Gespeichert', 'ok'); },
      }, ['Jetzt speichern']),
    ]),
  ]);

  const body = el('div.card-body', {}, [
    hinweis(
      'Die Daten liegen auf dem Server dieses Betriebs, nicht auf diesem Rechner. Die Verbindung läuft '
      + 'unverschlüsselt im internen Netz – nicht für offenes WLAN oder das Internet gedacht.'
    ),
    el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, [
      el('button.btn.btn-sm', { type: 'button', onclick: () => passwortAendernDialog() }, ['Passwort ändern']),
      el('button.btn.btn-sm', {
        type: 'button', onclick: exportieren,
        title: 'Zum Sichern oder um die Zeiten in den Einzelplatz-Betrieb mitzunehmen',
      }, ['Als Datei exportieren']),
      el('button.btn.btn-sm.btn-danger', {
        type: 'button',
        onclick: async () => {
          try { await api.abmelden(); } catch { /* egal */ }
          location.reload();
        },
      }, ['Abmelden']),
    ]),
  ]);
  karte.append(body);
  return karte;
}

function passwortAendernDialog() {
  const neu = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Neues Passwort' });
  const wdh = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Wiederholen' });
  const hinweisBox = el('div.hint', { text: 'Mindestens 6 Zeichen.' });

  return modal({
    titel: 'Passwort ändern',
    inhalt: el('div', { style: 'display:grid;gap:10px' }, [
      el('div.field', {}, [el('label', { text: 'Neues Passwort' }), neu]),
      el('div.field', {}, [el('label', { text: 'Wiederholen' }), wdh]),
      hinweisBox,
    ]),
    buttons: [
      { text: 'Abbrechen', wert: null },
      {
        text: 'Ändern', klasse: 'btn-primary', wert: '\0',
        vorAbschluss: () => {
          if (neu.value.length < 6) { hinweisBox.textContent = 'Mindestens 6 Zeichen.'; return false; }
          if (neu.value !== wdh.value) { hinweisBox.textContent = 'Stimmt nicht überein.'; return false; }
          return true;
        },
      },
    ],
  }).then(async (v) => {
    if (v !== '\0') return;
    try {
      await api.passwortAendern(neu.value);
      toast('Passwort geändert', 'ok');
    } catch (e) {
      toast('Fehlgeschlagen: ' + e.message, 'err', 6000);
    }
  });
}

/* ---------- Sicherungen (nur Admin) ---------- */

function sicherungKarte(neu) {
  const eigeneAnsicht = betrachtetSichSelbst();
  const karte = el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Sicherungen' }),
        el('div.sub', { text: eigeneAnsicht ? 'für dieses Konto' : `für „${state.daten.meta.name}"` }),
      ]),
    ]),
  ]);

  const body = el('div.card-body', {}, [
    el('div', { text: 'Sicherungen werden geladen …', style: 'color:var(--text-faint);font-size:13px' }),
  ]);
  karte.append(body);

  api.sicherungenAuflisten(betrachteteId()).then(({ sicherungen: liste }) => {
    leeren(body);
    body.append(hinweis(
      'Der Server legt einmal täglich eine Sicherung an – die letzten 20 Tage bleiben erhalten. '
      + 'Vor dem Wiederherstellen wird der aktuelle Stand selbst gesichert, der Schritt ist also umkehrbar.'
    ));

    if (!liste.length) {
      body.append(el('div.dim', { style: 'font-size:13px', text: 'Noch keine Sicherung vorhanden.' }));
    } else {
      body.append(el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Tag' }),
          el('th', { style: 'text-align:right', text: 'Größe' }),
          el('th', { text: '' }),
        ])]),
        el('tbody', {}, liste.map((b) => el('tr', {}, [
          el('td', { text: datum(b.tag) }),
          el('td.num', { text: num(b.groesse / 1024, 1) + ' kB' }),
          el('td', { style: 'text-align:right' }, [
            el('button.btn.btn-sm', { type: 'button', onclick: () => wiederherstellen(b.tag, neu) },
              ['Wiederherstellen']),
          ]),
        ]))),
      ]));
    }
  }).catch((e) => {
    leeren(body);
    body.append(el('div.startup-err', { text: 'Sicherungen konnten nicht gelesen werden: ' + e.message }));
  });

  return karte;
}

async function wiederherstellen(tag, neu) {
  const ok = await bestaetigen('Sicherung wiederherstellen',
    `Der aktuelle Stand wird zuvor gesichert. Danach gilt der Stand vom ${datum(tag)}.`,
    { okText: 'Wiederherstellen' });
  if (!ok) return;

  try {
    const { daten } = await api.sicherungWiederherstellen(betrachteteId(), tag);
    laden(daten);
    toast('Sicherung wiederhergestellt', 'ok');
    neu();
  } catch (e) {
    toast('Wiederherstellen fehlgeschlagen: ' + e.message, 'err', 6000);
  }
}

/* ---------- Protokoll ---------- */

function protokollKarte() {
  const eintraege = protokollEintraege().slice(0, 200);

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Änderungsprotokoll' }),
        el('div.sub', { text: `${state.daten.protokoll.length} Einträge, die letzten 200 werden gezeigt` }),
      ]),
    ]),
    eintraege.length
      ? el('div.plan-scroll', {}, [
          el('table.data.kompakt', {}, [
            el('thead', {}, [el('tr', {}, [
              el('th', { text: 'Zeitpunkt' }),
              el('th', { text: 'Wer' }),
              el('th', { text: 'Feld' }),
              el('th', { text: 'vorher' }),
              el('th', { text: 'nachher' }),
            ])]),
            el('tbody', {}, eintraege.map((p) => el('tr', {}, [
              el('td.faint', { text: new Date(p.zeit).toLocaleString('de-DE') }),
              el('td.faint', { text: p.wer || '–' }),
              el('td', { text: p.was }),
              el('td.faint', { text: wertText(p.alt) }),
              el('td', { text: wertText(p.neu) }),
            ]))),
          ]),
        ])
      : el('div.card-body', {}, [
          el('div.dim', { style: 'font-size:13px', text: 'Noch keine Änderungen protokolliert.' }),
        ]),
  ]);
}

function wertText(v) {
  if (v == null || v === '') return '–';
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  if (typeof v === 'number') return num(v, 2);
  return String(v);
}
