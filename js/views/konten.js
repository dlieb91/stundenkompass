/* Konten – nur fuer den Admin: Mitarbeiter anlegen, deaktivieren, Passwort
   zuruecksetzen.

   Ausgeschiedene Mitarbeiter werden deaktiviert, nicht geloescht – ihre
   Zeiten muessen erhalten bleiben. Ein deaktiviertes Konto kann sich nicht
   mehr anmelden, taucht aber weiter im Protokoll und in vergangenen
   Monaten auf.
*/

import { el, leeren, toast, bestaetigen, modal, datum } from '../util.js';
import { hinweis, abschnitt, parseZahl } from '../felder.js';
import * as api from '../api.js';
import { neueDaten } from '../store.js';
import { heuteISO } from '../kalender.js';

export const konten = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);
    const neu = () => { leeren(container); this.render(container); };

    const platz = el('div', { text: 'Lädt …', style: 'color:var(--text-faint);font-size:13px' });
    inner.append(platz);

    api.team().then(({ konten: liste }) => {
      leeren(inner);
      inner.append(anlegenKarte(liste, neu));
      inner.append(listeKarte(liste, neu));
    }).catch((e) => {
      leeren(inner);
      inner.append(el('div.startup-err', { text: 'Konten konnten nicht geladen werden: ' + e.message }));
    });
  },
};

/* ---------- Benutzername vorschlagen ---------- */

/**
 * Leitet aus einem Namen einen Benutzernamen ab: letztes Wort, Umlaute
 * umgeschrieben, Kollisionen mit einer angehängten Zahl aufgelöst.
 *
 * Wichtig ist die Reihenfolge der beiden Schreibweisen-Schritte: erst
 * werden Umlaute von Hand umgeschrieben (ä→ae …), *danach* erst
 * normalize('NFD') für übrige Akzente. Andersherum zerlegt normalize()
 * das ü bereits in u + Trema, und aus „Müller" würde „muller" statt
 * „mueller" – ein u zu wenig, das niemand beim Lesen bemerkt.
 */
function benutzernameVorschlag(name, liste) {
  const woerter = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!woerter.length) return '';

  const KOMBINIERENDE_AKZENTE = new RegExp('[\\u0300-\\u036f]', 'g');
  const basis = woerter[woerter.length - 1]
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(KOMBINIERENDE_AKZENTE, '')
    .replace(/[^a-z0-9-]/g, '');
  if (!basis) return '';

  const belegt = new Set(liste.map((k) => k.benutzer.toLowerCase()));
  if (!belegt.has(basis)) return basis;
  for (let n = 2; ; n++) {
    if (!belegt.has(basis + n)) return basis + n;
  }
}

/* ---------- Neues Konto ---------- */

function anlegenKarte(liste, neu) {
  const name = el('input', { type: 'text', placeholder: 'Vor- und Nachname' });
  const benutzer = el('input', { type: 'text', placeholder: 'wird aus dem Namen vorgeschlagen', autocomplete: 'off' });
  const rolle = el('select', {}, [
    el('option', { value: 'mitarbeiter', text: 'Mitarbeiter' }),
    el('option', { value: 'admin', text: 'Verwaltung' }),
  ]);
  const passwort = el('input', { type: 'text', placeholder: 'Anfangspasswort, mind. 6 Zeichen' });

  const vorlagenOptionen = [{ id: '', text: 'Keine – Standardwerte' }, ...liste.map((k) => ({ id: k.id, text: k.name }))];
  const vorlage = el('select', {}, vorlagenOptionen.map((o) => el('option', { value: o.id, text: o.text })));

  // Der Vorschlag zieht mit, solange niemand das Feld von Hand angefasst hat.
  // Wird es wieder ganz geleert, greift der Vorschlag erneut.
  let benutzerAngefasst = false;
  name.addEventListener('input', () => {
    if (benutzerAngefasst) return;
    benutzer.value = benutzernameVorschlag(name.value, liste);
  });
  benutzer.addEventListener('input', () => {
    benutzerAngefasst = benutzer.value.trim() !== '';
  });

  // Vertragswerte gleich beim Anlegen mitgeben – sonst ist das Konto bei der
  // ersten Anmeldung unbenutzbar: ohne Erfassungsbeginn rechnet nichts, und
  // die Vorgaben darf der Mitarbeiter nicht selbst nachtragen.
  const erfassungStart = el('input', { type: 'date', value: heuteISO() });
  const startsaldo = el('input', { type: 'text', inputmode: 'decimal', placeholder: '0' });
  const anspruch = el('input', { type: 'text', inputmode: 'decimal', placeholder: '30' });

  const fehlerBox = el('div.startup-err', { style: 'display:none;margin-top:10px' });

  const anlegen = async () => {
    fehlerBox.style.display = 'none';
    if (!benutzer.value.trim() || !name.value.trim() || passwort.value.length < 6) {
      fehlerBox.textContent = 'Benutzername, Name und ein Passwort mit mindestens 6 Zeichen sind erforderlich.';
      fehlerBox.style.display = '';
      return;
    }
    btn.disabled = true;
    try {
      const { konto } = await api.kontoAnlegen({
        benutzer: benutzer.value.trim(), name: name.value.trim(),
        rolle: rolle.value, passwort: passwort.value,
      });
      await datensatzAnlegen(konto.id, konto.name, {
        vorlageId: vorlage.value || null,
        erfassungStart: erfassungStart.value || null,
        startsaldo: parseZahl(startsaldo.value),
        anspruch: parseZahl(anspruch.value),
      });
      toast(`Konto „${konto.name}" angelegt`, 'ok');
      neu();
    } catch (e) {
      fehlerBox.textContent = e.message;
      fehlerBox.style.display = '';
      btn.disabled = false;
    }
  };

  const btn = el('button.btn.btn-primary.btn-sm', { type: 'button', onclick: anlegen }, ['Konto anlegen']);

  return abschnitt('Neues Konto', 'Zugangsdaten für ein weiteres Mitglied des Teams', [
    el('div', { style: 'display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))' }, [
      el('div.field', {}, [el('label', { text: 'Name' }), name]),
      el('div.field', {}, [
        el('label', { text: 'Benutzername' }), benutzer,
        el('div.hint', { text: 'Nur Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich – keine Leerzeichen, keine Umlaute.' }),
      ]),
      el('div.field', {}, [el('label', { text: 'Rolle' }), rolle]),
      el('div.field', {}, [el('label', { text: 'Anfangspasswort' }), passwort]),
      el('div.field', {}, [el('label', { text: 'Wochenplan übernehmen von' }), vorlage]),
    ]),

    el('div.sub', { text: 'Vorgaben für dieses Konto', style: 'margin:6px 0 8px' }),
    el('div', { style: 'display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))' }, [
      el('div.field', {}, [
        el('label', { text: 'Erfassung beginnt am' }), erfassungStart,
        el('div.hint', { text: 'Vor diesem Tag wird nichts gerechnet. Ein Tag in der Vergangenheit lässt alle Arbeitstage seither als Lücken ins Minus laufen.' }),
      ]),
      el('div.field', {}, [
        el('label', { text: 'Anfangsbestand (h)' }), startsaldo,
        el('div.hint', { text: 'Überstunden, die zum Beginn schon bestehen.' }),
      ]),
      el('div.field', {}, [
        el('label', { text: 'Urlaubsanspruch (Tage)' }), anspruch,
        el('div.hint', { text: 'Für das Jahr des Erfassungsbeginns.' }),
      ]),
    ]),
    fehlerBox,
    el('div', { style: 'margin-top:14px' }, [btn]),
    el('div.hint', {
      style: 'margin-top:8px',
      text: 'Die Person muss beim ersten Anmelden ein eigenes Passwort vergeben. Ohne Erfassungsbeginn '
        + 'rechnet ihr Stundenkonto nicht – sie kann ihn auch nicht selbst nachtragen.',
    }),
  ]);
}

/**
 * Legt den Datensatz des frisch angelegten Kontos gleich mit an, samt der
 * Vorgaben, die der Mitarbeiter nicht selbst setzen darf.
 *
 * Ohne das entsteht der Datensatz erst bei dessen erster Anmeldung – leer und
 * ohne Erfassungsbeginn. Genau daran scheiterte es bisher: das Dashboard
 * schickte ihn zum Einrichten in die Vorgaben, die für ihn gesperrt sind.
 *
 * Bleibt alles leer, wird nichts geschrieben – dann verhält sich das Anlegen
 * wie zuvor und die Verwaltung trägt die Werte später nach.
 */
async function datensatzAnlegen(neueId, name, { vorlageId, erfassungStart, startsaldo, anspruch }) {
  if (!vorlageId && !erfassungStart && startsaldo == null && anspruch == null) return;

  try {
    const basis = neueDaten(name);

    if (vorlageId) {
      const { daten: vorlageDaten } = await api.datenLesen(vorlageId);
      if (vorlageDaten?.wochenplaene?.length) {
        // Eigene Kennungen vergeben – ein Plan gehoert zu genau einem Datensatz.
        basis.wochenplaene = vorlageDaten.wochenplaene.map((p, i) => ({
          ...p, id: `plan-${Date.now().toString(36)}-${i}`,
        }));
      }
    }

    if (erfassungStart) basis.einstellungen.erfassungStart = erfassungStart;
    if (startsaldo != null) basis.einstellungen.startsaldoStunden = startsaldo;

    if (anspruch != null) {
      // Das Jahr des Erfassungsbeginns, nicht zwingend das laufende – wer im
      // Dezember ein Konto ab Januar anlegt, meint den Anspruch des neuen Jahres.
      const jahr = (erfassungStart || heuteISO()).slice(0, 4);
      basis.jahre[jahr] = { uebertrag: 0, genommenVorher: 0, ...(basis.jahre[jahr] || {}), anspruch };
    }

    await api.datenSchreiben(neueId, basis);
  } catch (e) {
    toast('Konto angelegt, die Vorgaben konnten aber nicht gesetzt werden: ' + e.message, 'err', 7000);
  }
}

/* ---------- Bestehende Konten ---------- */

function listeKarte(liste, neu) {
  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Bestehende Konten' }),
        el('div.sub', { text: `${liste.length} insgesamt, ${liste.filter((k) => k.aktiv).length} aktiv` }),
      ]),
    ]),
    el('div.plan-scroll', {}, [
      el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Name' }),
          el('th', { text: 'Benutzer' }),
          el('th', { text: 'Rolle' }),
          el('th', { text: 'Letzte Anmeldung' }),
          el('th', { text: 'Status' }),
          el('th', { text: '' }),
        ])]),
        el('tbody', {}, liste.map((k) => kontoZeile(k, neu))),
      ]),
    ]),
    hinweis('Ein deaktiviertes Konto kann sich nicht mehr anmelden. Seine Zeiten bleiben erhalten und zählen weiter in der Auswertung vergangener Monate.'),
  ]);
}

function kontoZeile(k, neu) {
  return el('tr', {}, [
    el('td', { text: k.name }),
    el('td.faint', { text: k.benutzer }),
    el('td.faint', { text: k.rolle === 'admin' ? 'Verwaltung' : 'Mitarbeiter' }),
    el('td.faint', { text: k.letzteAnmeldung ? datum(k.letzteAnmeldung) : 'noch nie' }),
    el('td', {}, [
      k.aktiv
        ? el('span.badge.blau', { text: 'aktiv' })
        : el('span.badge.grau', { text: 'deaktiviert' }),
    ]),
    el('td', { style: 'text-align:right;white-space:nowrap' }, [
      el('button.btn.btn-sm', { type: 'button', onclick: () => benutzernameAendernDialog(k, neu) }, ['Benutzername']),
      el('button.btn.btn-sm', { type: 'button', style: 'margin-left:6px', onclick: () => passwortZuruecksetzenDialog(k) }, ['Passwort']),
      el('button.btn.btn-sm' + (k.aktiv ? '.btn-danger' : ''), {
        type: 'button', style: 'margin-left:6px',
        onclick: () => aktivUmschalten(k, neu),
      }, [k.aktiv ? 'Deaktivieren' : 'Aktivieren']),
    ]),
  ]);
}

async function aktivUmschalten(k, neu) {
  if (k.aktiv) {
    const ok = await bestaetigen('Konto deaktivieren',
      `„${k.name}" kann sich danach nicht mehr anmelden. Die bisherigen Zeiten bleiben erhalten.`,
      { okText: 'Deaktivieren', gefahr: true });
    if (!ok) return;
  }
  try {
    await api.kontoAktivSetzen(k.id, !k.aktiv);
    toast(k.aktiv ? 'Deaktiviert' : 'Aktiviert', 'ok');
    neu();
  } catch (e) {
    toast('Fehlgeschlagen: ' + e.message, 'err', 6000);
  }
}

function passwortZuruecksetzenDialog(k) {
  const passwort = el('input', { type: 'text', placeholder: 'Neues Passwort, mind. 6 Zeichen' });
  const feld = el('div.field', {}, [
    el('label', { text: `Neues Passwort für „${k.name}"` }), passwort,
    el('div.hint', { text: 'Wird beim nächsten Anmelden zur Änderung aufgefordert.' }),
  ]);

  modal({
    titel: 'Passwort zurücksetzen',
    inhalt: feld,
    buttons: [
      { text: 'Abbrechen', wert: null },
      {
        text: 'Zurücksetzen', klasse: 'btn-primary', wert: '\0',
        vorAbschluss: () => passwort.value.length >= 6,
      },
    ],
  }).then(async (v) => {
    if (v !== '\0') return;
    try {
      await api.kontoPasswortZuruecksetzen(k.id, passwort.value);
      toast('Passwort zurückgesetzt', 'ok');
    } catch (e) {
      toast('Fehlgeschlagen: ' + e.message, 'err', 6000);
    }
  });
}

const BENUTZERNAME_MUSTER = /^[a-zA-Z0-9._-]{2,32}$/;

function benutzernameAendernDialog(k, neu) {
  const benutzer = el('input', { type: 'text', value: k.benutzer, autocomplete: 'off' });
  const feld = el('div.field', {}, [
    el('label', { text: `Neuer Benutzername für „${k.name}"` }), benutzer,
    el('div.hint', {
      text: 'Nur Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich. '
        + 'Die Person meldet sich danach mit diesem Namen an; eine laufende Sitzung wird beendet.',
    }),
  ]);

  modal({
    titel: 'Benutzername ändern',
    inhalt: feld,
    buttons: [
      { text: 'Abbrechen', wert: null },
      {
        text: 'Ändern', klasse: 'btn-primary', wert: '\0',
        vorAbschluss: () => BENUTZERNAME_MUSTER.test(benutzer.value.trim()),
      },
    ],
  }).then(async (v) => {
    if (v !== '\0') return;
    try {
      await api.kontoBenutzernameAendern(k.id, benutzer.value.trim());
      toast('Benutzername geändert', 'ok');
      neu();
    } catch (e) {
      toast('Fehlgeschlagen: ' + e.message, 'err', 6000);
    }
  });
}
