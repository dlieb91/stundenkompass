/* Speicherschicht: schreibt jetzt über die Server-API statt in einen
   selbst gewählten Ordner. Die nach außen sichtbare Oberfläche ist
   bewusst gleich geblieben wie im Einzelplatzbetrieb – datenquelle(),
   planeSpeichern(), sofortSpeichern(), speicher.status, speicher.onStatus –
   dadurch bleibt die Autosave-Choreografie in main.js und store.js
   unverändert.

   Neu hinzugekommen, weil mehrere Personen gleichzeitig schreiben können:

     Status 'konflikt'   der Server hat den Schreibvorgang abgelehnt, weil
                          der Datensatz inzwischen anderswo geändert wurde
                          (z. B. hat der Admin korrigiert). speicher.onKonflikt
                          bekommt den aktuellen Serverstand, damit store.js
                          ihn übernehmen kann, statt ihn zu überschreiben.

     speicher.onGespeichert  nach jedem *erfolgreichen* Schreiben: der Server
                          vergibt beim Speichern die neue meta.version (und
                          aktualisiert z. B. letztesBackup). Ohne das lokal
                          nachzuziehen, wuerde der naechste Speicherversuch
                          mit der alten Version antreten und faelschlich als
                          Konflikt abgelehnt – jeder zweite Speichervorgang
                          einer Sitzung wuerde so fehlschlagen.
*/

import * as api from './api.js';
import { betrachteteId } from './sitzung.js';

const AUTOSAVE_MS = 1500;

export const speicher = {
  status: 'idle',      // idle | dirty | saving | konflikt | error
  onStatus: null,       // Callback fuer die Statusanzeige
  onKonflikt: null,     // Callback (serverDaten) => void
  onGespeichert: null,  // Callback (serverMeta) => void, nach jedem erfolgreichen Schreiben
};

function setStatus(s, detail) {
  speicher.status = s;
  if (speicher.onStatus) speicher.onStatus(s, detail);
}

/** Datensatz eines Kontos laden – eigenes immer, fremdes nur als Admin (der Server prüft mit). */
export async function datenLesen(kontoId) {
  const { daten } = await api.datenLesen(kontoId);
  return daten;
}

let timer = null;
let laufend = null;
let holeDaten = null;

/** Registriert die Funktion, die den aktuellen Stand liefert. */
export function datenquelle(fn) {
  holeDaten = fn;
}

export function planeSpeichern() {
  if (!holeDaten) return;
  setStatus('dirty');
  clearTimeout(timer);
  timer = setTimeout(() => { sofortSpeichern(); }, AUTOSAVE_MS);
}

export async function sofortSpeichern() {
  if (!holeDaten) return;
  clearTimeout(timer);
  if (laufend) return laufend;

  laufend = (async () => {
    setStatus('saving');
    try {
      const daten = holeDaten();
      const { daten: gespeichert } = await api.datenSchreiben(betrachteteId(), daten);
      if (gespeichert?.meta && speicher.onGespeichert) speicher.onGespeichert(gespeichert.meta);
      setStatus('idle', new Date());
    } catch (e) {
      if (e.status === 409) {
        setStatus('konflikt', e.antwort?.daten);
        if (speicher.onKonflikt) speicher.onKonflikt(e.antwort?.daten);
        return;
      }
      if (e.status === 401) {
        setStatus('error');
        return; // api.js hat bereits das Abmelde-Ereignis ausgelöst
      }
      console.error('Speichern fehlgeschlagen:', e);
      setStatus('error', e);
      throw e;
    } finally {
      laufend = null;
    }
  })();
  return laufend;
}
