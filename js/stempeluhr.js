/* Stempeluhr – reines Rechenmodul, ohne DOM und ohne Import aus views/,
   util.js oder felder.js. Bekommt den Datensatz und die Uhrzeit von aussen;
   dadurch in Node pruefbar und unabhaengig davon, auf welchem Geraet
   gestempelt wird.

   Die Stempeluhr fuehrt **keinen eigenen Zustand**. Eingestempelt ist, wer
   einen Abschnitt mit Beginn, aber ohne Ende hat. Das steht in der Datei
   wie jede andere Erfassung – deshalb kann man am Handy kommen und am PC
   gehen, und Dropbox gleicht es mit ab wie alles andere.

     Kommen   haengt an den Tag einen Abschnitt { von: jetzt, bis: '' }
     Pause    beendet den offenen Abschnitt. Die Luecke bis zum naechsten
              Kommen ist die Pause (siehe zeit.js: pausenLuecken)
     Gehen    beendet den offenen Abschnitt – technisch dasselbe wie Pause
     Projekt  beendet den offenen Abschnitt und beginnt sofort einen neuen
     wechseln mit dem anderen Projekt

   Die Tagesart wird nicht angefasst. Am Feiertag oder Wochenende ergibt sie
   sich aus dem Kalender und bringt ihre Gutschrift mit; die gestempelte Zeit
   kommt obendrauf. Wuerde hier „Arbeit" gesetzt, fiele die Gutschrift weg
   und der Feiertag liefe ins Minus.

   Ein Abschnitt darf ueber Mitternacht laufen: Wer um 22:00 kommt und um
   02:00 geht, hat einen Abschnitt 22:00–02:00 am Vortag (so rechnet zeit.js
   ohnehin). Gesucht wird deshalb heute und gestern. */

import { zuMinuten, TAG_MINUTEN } from './zeit.js';
import { tagePlus } from './kalender.js';

/** Ab hier gilt ein offener Abschnitt als vermutlich vergessen. */
export const VERGESSEN_AB_MIN = 14 * 60;

/** Date → 'HH:MM' in Ortszeit. */
export function uhrzeitVon(date) {
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

const istOffen = (iv) => iv && zuMinuten(iv.von) != null && zuMinuten(iv.bis) == null;
const istLeer = (iv) => !iv || (!String(iv.von || '').trim() && !String(iv.bis || '').trim());

/**
 * Der laufende Abschnitt, oder null. Liefert { iso, index, von, projektId,
 * laufMin, gestern, vergessen }. laufMin zaehlt bis zur uebergebenen Uhrzeit.
 */
export function offenerAbschnitt(daten, heute, jetzt) {
  const jetztMin = zuMinuten(jetzt);
  for (const iso of [heute, tagePlus(heute, -1)]) {
    const intervalle = daten?.tage?.[iso]?.intervalle || [];
    for (let i = intervalle.length - 1; i >= 0; i--) {
      const iv = intervalle[i];
      if (!istOffen(iv)) continue;
      const von = zuMinuten(iv.von);
      const gestern = iso !== heute;
      // Heute und Beginn „in der Zukunft" heisst: die Uhr des Geraets stand
      // anders als beim Stempeln. Dann laeuft er eben noch nicht.
      const laufMin = gestern ? jetztMin + TAG_MINUTEN - von : Math.max(0, jetztMin - von);
      return {
        iso, index: i, von: iv.von, projektId: iv.projektId || null,
        laufMin, gestern, vergessen: laufMin >= VERGESSEN_AB_MIN,
      };
    }
  }
  return null;
}

/** Abgeschlossene und offene Abschnitte eines Tages, ohne leere Platzhalter. */
export function abschnitte(daten, iso) {
  return (daten?.tage?.[iso]?.intervalle || []).filter((iv) => !istLeer(iv));
}

/** Kommen: neuen Abschnitt beginnen. Leere Platzhalterzeilen fallen dabei weg. */
export function kommen(daten, iso, uhrzeit, projektId = null) {
  if (!daten.tage) daten.tage = {};
  if (!daten.tage[iso]) daten.tage[iso] = { art: null, intervalle: [], pauseMin: null, notiz: '' };
  const tag = daten.tage[iso];
  tag.intervalle = (tag.intervalle || []).filter((iv) => !istLeer(iv));
  const neu = { von: uhrzeit, bis: '' };
  if (projektId) neu.projektId = projektId;
  tag.intervalle.push(neu);
  return neu;
}

/**
 * Pause oder Gehen: den offenen Abschnitt beenden. Ein Abschnitt, der in
 * derselben Minute endet, in der er begann, wird wieder entfernt – er
 * zaehlt nichts und waere nur eine leere Zeile in der Erfassung.
 */
export function beenden(daten, offen, uhrzeit) {
  const tag = daten?.tage?.[offen.iso];
  const iv = tag?.intervalle?.[offen.index];
  if (!iv) return;
  if (iv.von === uhrzeit) {
    tag.intervalle.splice(offen.index, 1);
    return;
  }
  iv.bis = uhrzeit;
}

/** Projekt wechseln, ohne dass eine Pause entsteht. */
export function projektWechseln(daten, offen, heute, uhrzeit, projektId) {
  // Laeuft der Abschnitt erst seit dieser Minute, genuegt es, sein Projekt
  // umzuhaengen – sonst entstuende ein Abschnitt von null Minuten.
  const iv = daten?.tage?.[offen.iso]?.intervalle?.[offen.index];
  if (iv && iv.von === uhrzeit) {
    if (projektId) iv.projektId = projektId; else delete iv.projektId;
    return;
  }
  beenden(daten, offen, uhrzeit);
  kommen(daten, heute, uhrzeit, projektId);
}

/**
 * Wann ist das Tagessoll erreicht, wenn ohne weitere Pause durchgearbeitet
 * wird? 'HH:MM' oder null, wenn es schon erreicht ist oder nichts laeuft.
 */
export function sollErreichtUm(jetzt, restMin) {
  if (restMin == null || restMin <= 0) return null;
  const m = (zuMinuten(jetzt) + restMin) % TAG_MINUTEN;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
