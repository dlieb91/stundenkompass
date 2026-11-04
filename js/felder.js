/* Wiederverwendbare Formularfelder.

   Alle Felder schreiben direkt in das uebergebene Objekt und stossen
   ueber aendern() das Autosave an. Gespeichert wird beim Verlassen des
   Feldes (change), damit die Eingabe nicht unterbrochen wird.
*/

import { el, num } from './util.js';
import { aendern, protokollieren } from './store.js';

export function parseZahl(text) {
  if (text == null) return null;
  const s = String(text).trim().replace(/\s|€|%|m²/g, '');
  if (!s) return null;
  const normalisiert = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const v = Number(normalisiert);
  return Number.isFinite(v) ? v : null;
}

function huelle(label, control, hint) {
  return el('div.field', {}, [
    label ? el('label', { text: label }) : null,
    control,
    hint ? el('div.hint', { text: hint }) : null,
  ]);
}

function melden(opts) {
  if (typeof opts.nach === 'function') opts.nach();
}

/**
 * Schreibt eine Änderung ins Protokoll. Muss innerhalb von aendern()
 * laufen, damit sie mitgespeichert wird.
 *
 * opts.bezug   ID, unter der der Eintrag erscheinen soll (bei
 *              Unterobjekten wie o.kosten notwendig)
 * opts.stumm   true = nicht protokollieren
 */
function merken(opts, obj, label, alt, neu) {
  if (opts.stumm || !label) return;
  const a = alt ?? null;
  const n = neu ?? null;
  if (a === n) return;
  protokollieren(opts.bezug ?? obj.id ?? null, label, a, n);
}

/**
 * Setzt einen Wert, protokolliert ihn und stößt Speichern plus Rückmeldung an.
 * opts.gesperrt blockt den Schreibvorgang – der Riegel für Felder, die nur
 * die Verwaltung pflegen darf (siehe js/sitzung.js: darfVorgabenBearbeiten).
 */
function setzen(opts, obj, key, label, wert) {
  if (opts.gesperrt) return;
  const alt = obj[key];
  if (alt === wert) return;
  aendern(() => {
    obj[key] = wert;
    merken(opts, obj, label, alt, wert);
  });
  melden(opts);
}

export function textFeld(label, obj, key, opts = {}) {
  const input = el('input', {
    type: 'text', value: obj[key] ?? '', placeholder: opts.platzhalter || '', disabled: !!opts.gesperrt,
    onchange: (e) => setzen(opts, obj, key, label, e.target.value),
  });
  return huelle(label, input, opts.hint);
}

/**
 * Nacktes Zahlenfeld ohne Beschriftung und Hülle – für Ansichten, die
 * ihre eigene Umgebung bauen, etwa mit selbst nachgezogenen Hinweisen.
 * Die Beschriftung fürs Protokoll kommt über opts.label.
 */
export function zahlEingabe(obj, key, opts = {}) {
  const nk = opts.nachkomma ?? 2;
  return el('input', {
    type: 'text', inputmode: 'decimal', placeholder: opts.platzhalter || '', disabled: !!opts.gesperrt,
    value: obj[key] == null ? '' : num(obj[key], nk),
    onchange: (e) => {
      const v = parseZahl(e.target.value);
      setzen(opts, obj, key, opts.label, v);
      e.target.value = v == null ? '' : num(v, nk);
    },
  });
}

export function zahlFeld(label, obj, key, opts = {}) {
  const input = zahlEingabe(obj, key, { ...opts, label });
  const control = opts.suffix
    ? el('div.input-suffix', {}, [input, el('span', { text: opts.suffix })])
    : input;
  return huelle(label, control, opts.hint);
}

/**
 * Datumsfeld. Beim Tippen meldet der Browser jede Zwischenstufe der
 * Jahreszahl als Änderung – aus „2026" werden nacheinander die Jahre
 * 0002, 0020, 0202 und 2026. Solche Zwischenstände werden verworfen,
 * sonst würde jede Ziffer eine Neuberechnung auslösen.
 */
export function datumFeld(label, obj, key, opts = {}) {
  const input = el('input', {
    type: 'date', value: obj[key] || '', disabled: !!opts.gesperrt,
    onchange: (e) => {
      const wert = e.target.value || null;
      if (wert && !plausiblesDatum(wert)) return;
      setzen(opts, obj, key, label, wert);
    },
  });
  return huelle(label, input, opts.hint);
}

/** Jahreszahl im sinnvollen Bereich – filtert Tippzwischenstände heraus. */
export function plausiblesDatum(wert) {
  const jahr = Number(String(wert).slice(0, 4));
  return Number.isFinite(jahr) && jahr >= 1900 && jahr <= 2200;
}

/**
 * Uhrzeitfeld. Der Browser liefert 'HH:MM' oder einen leeren String; ein
 * halb getippter Wert kommt gar nicht erst als Änderung an, deshalb braucht
 * es hier – anders als beim Datum – keinen Filter für Zwischenstände.
 */
export function zeitFeld(label, obj, key, opts = {}) {
  const input = el('input', {
    type: 'time', value: obj[key] || '', disabled: !!opts.gesperrt,
    onchange: (e) => setzen(opts, obj, key, label, e.target.value || null),
  });
  return huelle(label, input, opts.hint);
}

/* ---------- Eingaben in Tabellenzeilen ----------
   Der Wert wird sofort übernommen, der Neuaufbau der Tabelle (Sortierung,
   abgeleitete Spalten) erst beim Verlassen des Feldes. Sonst verschwände
   die Zeile unter dem Cursor. */

function tabellenEingabe(attr, lesen, schreiben, { nach, umbauen, gesperrt }) {
  let veraendert = false;
  const input = el('input', {
    ...attr,
    disabled: !!gesperrt,
    onchange: (e) => {
      if (gesperrt) return;
      if (!schreiben(e)) return;
      veraendert = true;
      if (nach) nach();
    },
    onblur: () => {
      if (!veraendert) return;
      veraendert = false;
      if (umbauen) umbauen();
    },
  });
  input.value = lesen();
  return input;
}

export function tabellenDatum(obj, key, opts = {}) {
  return tabellenEingabe(
    { type: 'date', style: opts.style },
    () => obj[key] || '',
    (e) => {
      const wert = e.target.value || null;
      if (wert && !plausiblesDatum(wert)) return false;
      if (obj[key] === wert) return false;
      aendern(() => { obj[key] = wert; });
      return true;
    },
    opts,
  );
}

export function tabellenZeit(obj, key, opts = {}) {
  return tabellenEingabe(
    { type: 'time', style: opts.style, title: opts.title },
    () => obj[key] || '',
    (e) => {
      const wert = e.target.value || null;
      if ((obj[key] || null) === wert) return false;
      aendern(() => { obj[key] = wert; });
      return true;
    },
    opts,
  );
}

export function tabellenZahl(obj, key, opts = {}) {
  const nk = opts.nachkomma ?? 2;
  return tabellenEingabe(
    // Der Platzhalter zeigt den Wert, der ohne Eingabe gilt. Ein leeres Feld
    // heisst damit nicht „null", sondern „Vorgabe uebernehmen".
    { type: 'text', inputmode: 'decimal', placeholder: opts.platzhalter || '', style: opts.style || 'text-align:right' },
    () => (obj[key] == null ? '' : num(obj[key], nk)),
    (e) => {
      const v = parseZahl(e.target.value);
      e.target.value = v == null ? '' : num(v, nk);
      if (obj[key] === v) return false;
      aendern(() => { obj[key] = v; });
      return true;
    },
    opts,
  );
}

export function tabellenText(obj, key, opts = {}) {
  return tabellenEingabe(
    { type: 'text', placeholder: opts.platzhalter || '', style: opts.style },
    () => obj[key] || '',
    (e) => {
      if (obj[key] === e.target.value) return false;
      aendern(() => { obj[key] = e.target.value; });
      return true;
    },
    opts,
  );
}

/**
 * Auswahl in einer Tabellenzeile. Anders als bei Text- und Zahlenfeldern wird
 * hier sofort umgebaut: eine Auswahl ist mit einem Klick fertig, da gibt es
 * keinen Zwischenstand, der unter dem Cursor wegspringen könnte.
 */
export function tabellenAuswahl(obj, key, optionen, opts = {}) {
  return el('select', {
    style: opts.style,
    title: opts.title,
    onchange: (e) => {
      const treffer = optionen.find((o) => String(o.wert) === e.target.value);
      const wert = treffer ? treffer.wert : null;
      if (obj[key] === wert) return;
      aendern(() => { obj[key] = wert; });
      if (opts.nach) opts.nach();
    },
  }, optionen.map((o) => el('option', { value: String(o.wert), selected: obj[key] === o.wert }, [o.text])));
}

export function tabellenSchalter(obj, key, opts = {}) {
  return el('input', {
    type: 'checkbox', checked: !!obj[key], style: 'width:auto;margin:0', title: opts.title,
    onchange: (e) => {
      aendern(() => { obj[key] = e.target.checked; });
      if (opts.nach) opts.nach();
    },
  });
}

export function auswahlFeld(label, obj, key, optionen, opts = {}) {
  const sel = el('select', {
    disabled: !!opts.gesperrt,
    onchange: (e) => {
      const treffer = optionen.find((o) => String(o.wert) === e.target.value);
      setzen(opts, obj, key, label, treffer ? treffer.wert : e.target.value);
    },
  }, optionen.map((o) => el('option', { value: String(o.wert), selected: obj[key] === o.wert }, [o.text])));
  return huelle(label, sel, opts.hint);
}

export function schalterFeld(label, obj, key, opts = {}) {
  const input = el('input', {
    type: 'checkbox', checked: !!obj[key], style: 'width:auto;margin-right:9px', disabled: !!opts.gesperrt,
    onchange: (e) => setzen(opts, obj, key, label, e.target.checked),
  });
  return el('div.field', {}, [
    el('label', { style: 'display:flex;align-items:center;cursor:pointer;color:var(--text)' }, [input, label]),
    opts.hint ? el('div.hint', { text: opts.hint, style: 'margin-left:24px' }) : null,
  ]);
}

export function textBereich(label, obj, key, opts = {}) {
  const ta = el('textarea', {
    rows: opts.zeilen || 4, placeholder: opts.platzhalter || '', disabled: !!opts.gesperrt,
    onchange: (e) => setzen(opts, obj, key, label || opts.protokollLabel, e.target.value),
  });
  ta.value = obj[key] ?? '';
  return huelle(label, ta, opts.hint);
}

/** Reines Anzeigefeld fuer berechnete Werte. */
export function anzeigeFeld(label, wert, opts = {}) {
  return el('div.field', {}, [
    el('label', { text: label }),
    el('div.readonly' + (opts.klasse ? '.' + opts.klasse : ''), { text: wert }),
    opts.hint ? el('div.hint', { text: opts.hint }) : null,
  ]);
}

/* ---------- Layout ---------- */

export function felderGitter(felder, minBreite = 210) {
  return el('div', {
    style: `display:grid;grid-template-columns:repeat(auto-fit,minmax(${minBreite}px,1fr));gap:0 18px`,
  }, felder);
}

export function abschnitt(titel, sub, inhalt, hinweisHtml) {
  return el('div.card', {}, [
    titel ? el('div.card-head', {}, [
      el('div', {}, [el('h2', { text: titel }), sub ? el('div.sub', { text: sub }) : null]),
    ]) : null,
    el('div.card-body', {}, [
      hinweisHtml ? hinweis(hinweisHtml) : null,
      ...[].concat(inhalt),
    ]),
  ]);
}

export function hinweis(html) {
  return el('div.note', { style: 'margin-bottom:16px' }, [
    el('div.note-icon', { html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>' }),
    el('div', { html }),
  ]);
}
