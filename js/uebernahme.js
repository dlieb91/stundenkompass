/* Zeiten aus einer Datei uebernehmen – der Weg vom Team-Server, aus einer
   anderen Ablage oder aus einer alten Sicherung in den Einzelplatz.

   Ein Dateifeld, das schon beim Auswaehlen prueft, ob die Datei taugt. So
   steht die Fehlermeldung neben dem Feld, statt erst nach dem Bestaetigen
   als Toast aufzutauchen, wenn der Dialog schon zu ist. */

import { el } from './util.js';
import { migrieren } from './store.js';

/**
 * Prueft eine eingelesene Datei und hebt sie auf den aktuellen Stand.
 * Wirft mit einem Satz, den man versteht.
 */
export function pruefen(roh) {
  if (!roh || typeof roh !== 'object' || (!roh.tage && !roh.wochenplaene)) {
    throw new Error('Das ist keine StundenKompass-Datei.');
  }
  const daten = migrieren(JSON.parse(JSON.stringify(roh)));
  /* Die Sicherung des Tages soll den Stand *vor* der Uebernahme festhalten.
     Truege die Datei schon den heutigen Stempel, fiele sie aus. */
  daten.meta.letztesBackup = null;
  return daten;
}

/** Liefert { element, daten() } – daten() ist null, solange nichts Gueltiges gewaehlt ist. */
export function dateiFeld() {
  let gewaehlt = null;
  const meldung = el('div', { style: 'font-size:12px;color:var(--text-faint);margin-top:4px' });
  const input = el('input', {
    type: 'file', accept: '.json,application/json',
    onchange: async () => {
      gewaehlt = null;
      const file = input.files?.[0];
      if (!file) { meldung.textContent = ''; return; }
      try {
        gewaehlt = pruefen(JSON.parse(await file.text()));
        const tage = Object.keys(gewaehlt.tage || {}).length;
        meldung.style.color = 'var(--pos)';
        meldung.textContent = `„${gewaehlt.meta.name}" – ${tage} erfasste Tage`;
      } catch (e) {
        meldung.style.color = 'var(--neg)';
        meldung.textContent = e instanceof SyntaxError ? 'Die Datei ist kein gültiges JSON.' : e.message;
      }
    },
  });
  return {
    element: el('div', {}, [input, meldung]),
    daten: () => gewaehlt,
  };
}
