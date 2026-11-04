/* Sitzung im Browser: wer ist angemeldet, welche Rolle, welches Konto wird
   gerade betrachtet.

   Unterscheidung, die immer wieder gebraucht wird:
     eigeneId()      das Konto, mit dem sich die Person angemeldet hat
     betrachteteId() das Konto, dessen Datensatz gerade offen ist – beim
                      Mitarbeiter immer die eigene Id, beim Admin je nach
                      Wahl im Umschalter auch eine fremde

   Die Wahl des Admin-Umschalters gehört in den localStorage, nicht in
   eine Datendatei – sie beschreibt die Sicht, nicht die Zahlen.
*/

const SPEICHER_KEY = 'stundenkompass-betrachtet';

export const sitzung = {
  konto: null, // { id, benutzer, name, rolle, ... } – das eigene, angemeldete Konto
  betrachtetId: null, // nur beim Admin abweichend von konto.id
};

export function gesetzt(konto) {
  sitzung.konto = konto;
  sitzung.betrachtetId = konto.rolle === 'admin'
    ? (localStorage.getItem(SPEICHER_KEY) || konto.id)
    : konto.id;
}

export function verworfen() {
  sitzung.konto = null;
  sitzung.betrachtetId = null;
}

export const angemeldet = () => !!sitzung.konto;
export const istAdmin = () => sitzung.konto?.rolle === 'admin';
export const eigeneId = () => sitzung.konto?.id ?? null;
export const betrachteteId = () => sitzung.betrachtetId ?? eigeneId();
export const betrachtetSichSelbst = () => betrachteteId() === eigeneId();

/** Nur der Admin darf umschalten; ein Mitarbeiter sieht ausschließlich sich selbst. */
export function betrachtenSetzen(kontoId) {
  if (!istAdmin()) return;
  sitzung.betrachtetId = kontoId;
  localStorage.setItem(SPEICHER_KEY, kontoId);
}

/**
 * Duerfen Wochenplan, Erfassungsbeginn, Anfangsbestand, Urlaubsanspruch und
 * Bundesland veraendert werden? Nur der Admin pflegt diese Vorgaben – ganz
 * gleich, ob er dabei sein eigenes oder ein fremdes Konto betrachtet.
 */
export const darfVorgabenBearbeiten = () => istAdmin();

/** Name fuer das Aenderungsprotokoll: wer hat tatsaechlich gehandelt. */
export const wer = () => sitzung.konto?.name ?? null;
