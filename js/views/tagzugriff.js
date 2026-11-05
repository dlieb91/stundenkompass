/* Zugriff auf einen Tag – gemeinsam fuer die Erfassungstabelle am PC und
   das Bearbeiten-Blatt am Handy.

   Die Felder schreiben nicht unmittelbar in einen Tageseintrag, sondern
   ueber diese Objekte. Der Grund: einen Tag, den man nur angeklickt hat,
   soll die Datei nicht behalten. Erst wenn wirklich etwas darinsteht,
   entsteht ein Eintrag – und sobald er wieder leer ist, verschwindet er. */

import { aendern, tagHolen, tagLesen, tagAufraeumen } from '../store.js';
import { projektGenutzt } from '../stammdaten.js';

export function tagZugriff(iso, standardArt) {
  const schreiben = (fn) => { fn(tagHolen(iso)); tagAufraeumen(iso); };
  return {
    get art() { return tagLesen(iso)?.art || standardArt; },
    // Wer die ohnehin geltende Art auswaehlt, hebt die Ausnahme wieder auf –
    // gespeichert wird nur, was vom Kalender abweicht.
    set art(w) { schreiben((t) => { t.art = w === standardArt ? null : w; }); },
    get pauseMin() { return tagLesen(iso)?.pauseMin ?? null; },
    set pauseMin(w) { schreiben((t) => { t.pauseMin = w; }); },
    get notiz() { return tagLesen(iso)?.notiz || ''; },
    set notiz(w) { schreiben((t) => { t.notiz = w; }); },
  };
}

export function intervallZugriff(iso, index) {
  const lesen = () => tagLesen(iso)?.intervalle?.[index] || null;
  const schreiben = (feld, wert) => {
    const tag = tagHolen(iso);
    if (!Array.isArray(tag.intervalle)) tag.intervalle = [];
    while (tag.intervalle.length <= index) tag.intervalle.push({ von: '', bis: '' });
    tag.intervalle[index][feld] = wert || '';

    const hatZeiten = tag.intervalle.some((iv) => iv.von || iv.bis);
    // Wer eine Zeit eintraegt, hat gearbeitet – die Tagesart ergibt sich von
    // selbst und muss nicht zusaetzlich ausgewaehlt werden.
    if (hatZeiten && !tag.art) tag.art = 'arbeit';
    if (!hatZeiten && tag.art === 'arbeit') tag.art = null;
    tagAufraeumen(iso);
  };
  return {
    get von() { return lesen()?.von || ''; },
    set von(w) { schreiben('von', w); },
    get bis() { return lesen()?.bis || ''; },
    set bis(w) { schreiben('bis', w); },
    get projektId() { return lesen()?.projektId || ''; },
    set projektId(w) { schreiben('projektId', w); if (w) projektGenutzt(w); },
  };
}

/** Weiteren, leeren Abschnitt anhaengen. */
export function abschnittAnhaengen(iso) {
  aendern(() => {
    const t = tagHolen(iso);
    if (!Array.isArray(t.intervalle)) t.intervalle = [];
    if (!t.intervalle.length) t.intervalle.push({ von: '', bis: '' });
    t.intervalle.push({ von: '', bis: '' });
  });
}

/** Abschnitt entfernen; ein danach leerer Tag verschwindet aus der Datei. */
export function abschnittEntfernen(iso, index) {
  aendern(() => {
    const t = tagHolen(iso);
    t.intervalle.splice(index, 1);
    tagAufraeumen(iso);
  });
}

/** Die Art, die ohne eigenen Eintrag von selbst gilt – siehe tagesBilanz(). */
export function standardArt(b) {
  if (b.feiertagName) return 'feiertag';
  return b.sollMin === 0 ? 'frei' : 'arbeit';
}
