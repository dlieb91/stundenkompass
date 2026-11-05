/* Monatsbericht – reines Rechenmodul, ohne DOM und ohne Import aus views/,
   util.js oder felder.js. Stellt zusammen, was auf dem Blatt steht; wie es
   aussieht, entscheidet views/berichtDruck.js.

   Der Bericht rechnet bis zum *Stichtag*: dem Monatsende, oder heute, wenn
   der Monat noch laeuft. Tage danach stehen im Bericht, zaehlen aber nicht
   – genau wie in der Erfassung. Das Blatt sagt dann ausdruecklich, dass
   der Monat nicht abgeschlossen ist.

   Stundenkonto:
     Stand vorher   gesamtSaldo bis zum Tag vor dem Monatsersten. Liegt der
                    Erfassungsbeginn in diesem Monat oder spaeter, ist das
                    schlicht der Anfangsbestand.
     Saldo Monat    Summe der Tagessalden des Monats bis zum Stichtag
     Stand nachher  gesamtSaldo bis zum Stichtag
   Die Probe vorher + Monat = nachher gilt immer; der Test prueft sie. */

import {
  monatsBilanz, gesamtSaldo, urlaubsBilanz, erfassungsBeginn, wochenplanFuer, wochenSollMinuten,
} from './saldo.js';
import { tageImMonat, tagePlus, WOCHENTAGE, monatsBezeichnung } from './kalender.js';
import { pausenLuecken, WARNTEXTE } from './zeit.js';

const zwei = (n) => String(n).padStart(2, '0');

/**
 * opts.heute         ISO, sonst wird nichts in der Zukunft gezaehlt
 * opts.projektName   (id) => Anzeigename; ohne: die id selbst
 * opts.projektpflicht wie in der Erfassung, fuer die Beanstandungen
 */
export function monatsbericht(daten, jahr, monat, opts = {}) {
  const heute = opts.heute;
  const projektName = opts.projektName || ((id) => id);
  const erster = `${jahr}-${zwei(monat)}-01`;
  const letzter = `${jahr}-${zwei(monat)}-${zwei(tageImMonat(jahr, monat))}`;
  const stichtag = heute < letzter ? heute : letzter;
  const laufend = heute < letzter;
  const zukunft = heute < erster;

  const bilanz = monatsBilanz(jahr, monat, daten, { heute: stichtag, projektpflicht: opts.projektpflicht });
  const beginn = erfassungsBeginn(daten);

  const zeilen = bilanz.tage.map((b) => {
    const tag = daten?.tage?.[b.iso] || null;
    const intervalle = (tag?.intervalle || []).filter((iv) => iv && (iv.von || iv.bis));
    return {
      iso: b.iso,
      wochentag: WOCHENTAGE[(new Date(b.iso + 'T00:00:00Z').getUTCDay() + 6) % 7],
      art: b.art,
      artText: b.art === 'feiertag' && b.feiertagName ? b.feiertagName : b.artInfo.text,
      explizit: !!tag?.art,
      zeiten: intervalle.map((iv) => `${iv.von || '?'}–${iv.bis || '?'}`),
      pauseMin: (tag?.pauseMin || 0) + pausenLuecken(intervalle),
      istMin: b.istMin,
      sollMin: b.sollMin,
      saldoMin: b.saldoMin,
      zaehlt: b.zaehlt,
      vorBeginn: !!beginn && b.iso < beginn,
      frei: b.sollMin === 0,
      luecke: b.luecke,
      projekte: [...new Set(intervalle.map((iv) => iv.projektId).filter(Boolean))].map(projektName),
      notiz: tag?.notiz || '',
      warnungen: b.warnungen.map((w) => WARNTEXTE[w]),
    };
  });

  const vorher = gesamtSaldo(daten, tagePlus(erster, -1)).saldoMin;
  const nachher = gesamtSaldo(daten, zukunft ? tagePlus(erster, -1) : stichtag).saldoMin;
  const urlaub = urlaubsBilanz(jahr, daten, { heute: stichtag });
  const plan = wochenplanFuer(letzter, daten);

  return {
    titel: monatsBezeichnung(jahr, monat),
    jahr, monat, erster, letzter, stichtag, laufend, zukunft,
    name: daten?.meta?.name || '',
    zeitmodell: plan ? `${plan.bezeichnung || 'Zeitmodell'} · ${wochenSollMinuten(plan) / 60} h je Woche` : '',
    zeilen,
    summen: {
      sollMin: bilanz.sollMin,
      istMin: bilanz.istMin,
      saldoMin: bilanz.saldoMin,
      urlaubTage: bilanz.urlaubTage,
      krankTage: bilanz.krankTage,
      luecken: bilanz.luecken,
    },
    konto: {
      vorherMin: vorher,
      vorherIstAnfangsbestand: !beginn || beginn >= erster,
      monatMin: bilanz.saldoMin,
      nachherMin: nachher,
    },
    urlaub: {
      jahr,
      gesamt: urlaub.gesamt,
      vorher: urlaub.vorher,
      genommen: urlaub.genommen,
      geplant: urlaub.geplant,
      verbleibend: urlaub.verbleibend,
    },
    beanstandungen: zeilen.filter((z) => z.zaehlt && z.warnungen.length)
      .map((z) => ({ iso: z.iso, texte: z.warnungen })),
  };
}
