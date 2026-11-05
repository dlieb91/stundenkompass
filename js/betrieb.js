/* Betriebsart: Team oder Einzelplatz.

   Derselbe Code laeuft an zwei Orten:

     team     ausgeliefert von server.js im Netz des Betriebs. Anmeldung,
              Rollen, Daten aller Mitarbeiter auf dem Server-Rechner.
     einzel   ausgeliefert als reine Dateien, etwa von GitHub Pages. Kein
              Server, keine Konten – eine Person, ihre Zeiten, abgelegt in
              einem Ordner, im Geraetespeicher oder in Dropbox.

   Woran man den Unterschied erkennt: Nur der Team-Server beantwortet
   /api/sitzung mit JSON (200 oder 401). GitHub Pages liefert dort eine
   HTML-Fehlerseite.

   Ohne Netz laesst sich das nicht pruefen. Dann entscheidet, was beim
   letzten erfolgreichen Start galt – sonst stuende ein Mitarbeiter, dessen
   Server gerade nicht laeuft, ploetzlich vor dem Einzelplatz-Startbildschirm
   und legte dort Zeiten an, die nie beim Team ankommen.

   Die gemerkte Betriebsart ist Sicht, nicht Daten: localStorage. */

const KEY = 'stundenkompass-betrieb';

export const betrieb = {
  art: null,          // 'team' | 'einzel'
  serverFehlt: false, // team, aber der Server antwortet gerade nicht
};

export const istEinzel = () => betrieb.art === 'einzel';
export const istTeam = () => betrieb.art === 'team';

export async function betriebErmitteln() {
  try {
    const res = await fetch('api/sitzung', { credentials: 'same-origin', cache: 'no-store' });
    const typ = res.headers.get('content-type') || '';
    const team = typ.includes('application/json') && (res.ok || res.status === 401);
    betrieb.art = team ? 'team' : 'einzel';
  } catch {
    const zuletzt = localStorage.getItem(KEY);
    betrieb.art = zuletzt === 'team' ? 'team' : 'einzel';
    betrieb.serverFehlt = betrieb.art === 'team';
  }
  try { localStorage.setItem(KEY, betrieb.art); } catch { /* privates Fenster */ }
  return betrieb.art;
}
