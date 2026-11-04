/* Duenne Huelle um fetch() fuer die /api/-Routen des Servers.

   Jede Funktion gibt bei Erfolg das geparste JSON zurueck. Bei einem
   Serverfehler wird eine Error geworfen, die zwei zusaetzliche Felder
   traegt:
     status   der HTTP-Status
     antwort  der geparste Fehlerkoerper (falls vorhanden), etwa
              { daten } bei 409 – der aktuelle Stand zum Nachladen

   401 loest zusaetzlich ein eigenes Ereignis aus, auf das main.js hoert,
   um zur Anmeldung zurueckzukehren – das erspart jedem Aufrufer eine
   eigene Fallunterscheidung.
*/

async function anfrage(pfad, opts = {}) {
  let res;
  try {
    res = await fetch(pfad, {
      credentials: 'same-origin',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      ...opts,
    });
  } catch (e) {
    const fehler = new Error('Server nicht erreichbar. Läuft er noch?');
    fehler.status = 0;
    throw fehler;
  }

  let antwort = null;
  try { antwort = await res.json(); } catch { /* leerer oder kein JSON-Körper */ }

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('sk:abgemeldet'));
  }

  if (!res.ok) {
    const fehler = new Error(antwort?.fehler || `Serverfehler (${res.status})`);
    fehler.status = res.status;
    fehler.antwort = antwort;
    throw fehler;
  }
  return antwort;
}

export const anmelden = (benutzer, passwort) =>
  anfrage('/api/anmelden', { method: 'POST', body: JSON.stringify({ benutzer, passwort }) });

export const abmelden = () => anfrage('/api/abmelden', { method: 'POST' });

export const sitzung = () => anfrage('/api/sitzung');

export const passwortAendern = (neu) =>
  anfrage('/api/passwort', { method: 'POST', body: JSON.stringify({ neu }) });

export const datenLesen = (kontoId) =>
  anfrage('/api/daten?konto=' + encodeURIComponent(kontoId));

export const datenSchreiben = (kontoId, daten) =>
  anfrage('/api/daten?konto=' + encodeURIComponent(kontoId), { method: 'PUT', body: JSON.stringify(daten) });

export const team = () => anfrage('/api/team');

export const uebersicht = () => anfrage('/api/uebersicht');

export const kontoAnlegen = (angaben) =>
  anfrage('/api/konto', { method: 'POST', body: JSON.stringify({ aktion: 'anlegen', ...angaben }) });

export const kontoAktivSetzen = (id, aktiv) =>
  anfrage('/api/konto', { method: 'POST', body: JSON.stringify({ aktion: 'aktiv', id, aktiv }) });

export const kontoUmbenennen = (id, name) =>
  anfrage('/api/konto', { method: 'POST', body: JSON.stringify({ aktion: 'umbenennen', id, name }) });

export const kontoBenutzernameAendern = (id, benutzer) =>
  anfrage('/api/konto', { method: 'POST', body: JSON.stringify({ aktion: 'benutzername', id, benutzer }) });

export const kontoPasswortZuruecksetzen = (id, passwort) =>
  anfrage('/api/konto', { method: 'POST', body: JSON.stringify({ aktion: 'passwort-zuruecksetzen', id, passwort }) });

export const sicherungenAuflisten = (kontoId) =>
  anfrage('/api/sicherungen?konto=' + encodeURIComponent(kontoId));

export const sicherungWiederherstellen = (kontoId, tag) =>
  anfrage('/api/sicherungen/wiederherstellen', { method: 'POST', body: JSON.stringify({ konto: kontoId, tag }) });

/* ---------- Kunden und Projekte ----------
   Lesen dürfen alle Angemeldeten, Schreiben nur der Admin (der Server prüft mit). */

export const stammdaten = () => anfrage('/api/stammdaten');

const stammdatenAktion = (aktion, angaben) =>
  anfrage('/api/stammdaten', { method: 'POST', body: JSON.stringify({ aktion, ...angaben }) });

export const kundeAnlegen = (angaben) => stammdatenAktion('kunde-anlegen', angaben);
export const kundeAendern = (id, angaben) => stammdatenAktion('kunde-aendern', { id, ...angaben });
export const kundeAktivSetzen = (id, aktiv) => stammdatenAktion('kunde-aktiv', { id, aktiv });

export const projektAnlegen = (angaben) => stammdatenAktion('projekt-anlegen', angaben);
export const projektAendern = (id, angaben) => stammdatenAktion('projekt-aendern', { id, ...angaben });
export const projektAktivSetzen = (id, aktiv) => stammdatenAktion('projekt-aktiv', { id, aktiv });

export const projektpflichtSetzen = (an) => stammdatenAktion('projektpflicht', { an });
