/* Auswertung der Projektbuchungen – reines Rechenmodul, ohne DOM-Bezug und
   ohne Import aus views/, util.js oder felder.js. Bekommt fertige
   Datensätze und Stammdaten hereingereicht, ruft selbst nichts ab; dadurch
   bleibt es wie saldo.js direkt in Node prüfbar.

   Ein Zeitabschnitt trägt sein Projekt direkt (intervall.projektId, siehe
   store.js Schema 4). Ein Tag kann daneben eine eigene Pause haben
   (tag.pauseMin), die keinem einzelnen Abschnitt gehört – sie wird anteilig
   nach Bruttodauer auf die Abschnitte dieses Tages verteilt, mit dem
   größten-Rest-Verfahren auf ganze Minuten gerundet. So bleibt die Summe
   über alle Projekte plus die nicht zugeordnete Zeit *exakt* gleich der
   Summe der Ist-Zeiten im Zeitraum – unabhängig davon, wie viele Abschnitte
   ein Tag hat oder ob einer davon kein Projekt trägt.
*/

import { intervallDauer } from './zeit.js';

/**
 * Minuten eines Tages je Abschnitt, mit anteilig verteilter Tagespause.
 * Gibt { projektId, minuten }[] zurück, eines je vollständig ausgefülltem
 * Abschnitt mit einer Dauer größer null.
 */
function tagesAnteile(tag) {
  const intervalle = (tag?.intervalle || []).filter((iv) => intervallDauer(iv));
  if (!intervalle.length) return [];

  const brutto = intervalle.map((iv) => intervallDauer(iv));
  const bruttoGesamt = brutto.reduce((s, m) => s + m, 0);
  const pause = Math.min(Math.max(0, tag?.pauseMin ?? 0), bruttoGesamt);
  const netGesamt = bruttoGesamt - pause;

  if (netGesamt <= 0) {
    return intervalle.map((iv) => ({ projektId: iv.projektId || null, minuten: 0 }));
  }

  // Groesstes-Rest-Verfahren: erst anteilig abrunden, dann den fehlenden
  // Rest an die Abschnitte mit dem groessten abgeschnittenen Bruch verteilen,
  // bis die Summe wieder exakt netGesamt ergibt.
  const roh = brutto.map((m) => (m * netGesamt) / bruttoGesamt);
  const minuten = roh.map(Math.floor);
  let rest = netGesamt - minuten.reduce((s, m) => s + m, 0);
  const reihenfolge = roh
    .map((_, i) => i)
    .sort((a, b) => (roh[b] - minuten[b]) - (roh[a] - minuten[a]));
  for (const i of reihenfolge) {
    if (rest <= 0) break;
    minuten[i] += 1;
    rest -= 1;
  }

  return intervalle.map((iv, i) => ({ projektId: iv.projektId || null, minuten: minuten[i] }));
}

function mitarbeiterName(mitarbeiterListe, kontoId) {
  return mitarbeiterListe.find((m) => m.konto.id === kontoId)?.konto.name || kontoId;
}

/**
 * Aggregiert die Zeiten aller Mitarbeiter im Zeitraum [vonISO, bisISO] nach
 * Projekt, Kunde und – innerhalb eines Projekts – nach Mitarbeiter.
 *
 * mitarbeiterListe  wie von GET /api/uebersicht: [{ konto, daten }]
 * stammdaten        { kunden, projekte }, wie von GET /api/stammdaten
 */
export function projektAuswertung(mitarbeiterListe, stammdaten, vonISO, bisISO) {
  const kundenKarte = new Map((stammdaten?.kunden || []).map((k) => [k.id, k]));
  const projekteKarte = new Map((stammdaten?.projekte || []).map((p) => [p.id, p]));

  const jeProjektKarte = new Map(); // projektId -> { minuten, jeMitarbeiter: Map(kontoId -> minuten) }
  let ohneProjektMinuten = 0;
  let gesamtMinuten = 0;

  for (const eintrag of mitarbeiterListe || []) {
    const { konto, daten } = eintrag;
    if (!daten?.tage) continue;
    for (const [iso, tag] of Object.entries(daten.tage)) {
      if (iso < vonISO || iso > bisISO) continue;
      for (const { projektId, minuten } of tagesAnteile(tag)) {
        if (!minuten) continue;
        gesamtMinuten += minuten;
        if (!projektId) { ohneProjektMinuten += minuten; continue; }
        if (!jeProjektKarte.has(projektId)) {
          jeProjektKarte.set(projektId, { minuten: 0, jeMitarbeiter: new Map() });
        }
        const p = jeProjektKarte.get(projektId);
        p.minuten += minuten;
        p.jeMitarbeiter.set(konto.id, (p.jeMitarbeiter.get(konto.id) || 0) + minuten);
      }
    }
  }

  const jeProjekt = [...jeProjektKarte.entries()]
    .map(([projektId, { minuten, jeMitarbeiter }]) => {
      const projekt = projekteKarte.get(projektId);
      return {
        projektId,
        code: projekt?.code || '(gelöschtes Projekt)',
        name: projekt?.name || '(unbekanntes Projekt)',
        kundeId: projekt?.kundeId || null,
        minuten,
        jeMitarbeiter: [...jeMitarbeiter.entries()]
          .map(([kontoId, min]) => ({ kontoId, name: mitarbeiterName(mitarbeiterListe, kontoId), minuten: min }))
          .sort((a, b) => b.minuten - a.minuten),
      };
    })
    .sort((a, b) => b.minuten - a.minuten);

  const jeKundeKarte = new Map();
  for (const p of jeProjekt) {
    const key = p.kundeId || '__ohne__';
    jeKundeKarte.set(key, (jeKundeKarte.get(key) || 0) + p.minuten);
  }
  const jeKunde = [...jeKundeKarte.entries()]
    .map(([kundeId, minuten]) => ({
      kundeId: kundeId === '__ohne__' ? null : kundeId,
      name: kundeId === '__ohne__' ? 'Ohne Kunde' : (kundenKarte.get(kundeId)?.name || '(unbekannter Kunde)'),
      minuten,
    }))
    .sort((a, b) => b.minuten - a.minuten);

  return { jeProjekt, jeKunde, ohneProjektMinuten, gesamtMinuten };
}
