/* Einstellungen – eigenes Konto, Server, Sicherungen (Admin), Änderungsprotokoll.

   Die Ordner-Sicherungen des Einzelplatzbetriebs sind Server-Sicherungen
   geworden: sie liegen jetzt auf dem Server-Rechner und sind nur für die
   Verwaltung einsehbar (server/ablage.js legt sie täglich an).
*/

import {
  el, leeren, num, datum, toast, bestaetigen, abfragen, modal,
} from '../util.js';
import { abschnitt, hinweis } from '../felder.js';
import {
  state, aendern, laden, protokollEintraege,
} from '../store.js';
import { speicher, sofortSpeichern } from '../storage.js';
import {
  sitzung, istAdmin, betrachteteId, betrachtetSichSelbst,
} from '../sitzung.js';
import * as api from '../api.js';

export const einstellungen = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    const neu = () => { leeren(container); this.render(container); };

    inner.append(kopfKarte(neu));
    inner.append(kontoKarte());
    if (istAdmin()) inner.append(sicherungKarte(neu));
    inner.append(protokollKarte());
  },
};

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
