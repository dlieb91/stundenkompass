/* Zeitrechnung – reine Rechnung, keine Oberflaeche.

   Gerechnet wird durchgehend in Minuten. Uhrzeiten stehen als 'HH:MM' in der
   Datei: das bleibt beim Hineinschauen lesbar und ist genau das, was ein
   <input type="time"> liefert und erwartet.

   Modell eines Arbeitstages:
     intervalle   beliebig viele Abschnitte { von, bis }
     pauseMin     zusaetzlich abgezogene Pause in Minuten
     ist          Summe der Intervalle − pauseMin

   Die Luecke zwischen zwei Intervallen ist damit *keine* zusaetzliche Pause.
   Wer 08:00–12:00 und 12:45–17:00 eintraegt, hat seine Pause bereits durch die
   Luecke ausgedrueckt und laesst pauseMin auf null. Wer einen Abschnitt
   08:00–17:00 eintraegt, schreibt die 45 Minuten ins Pausenfeld. Beide Wege
   fuehren zum selben Ist – aber nur, weil die Luecke nicht doppelt zaehlt.
*/

export const TAG_MINUTEN = 1440;

/* Arbeitszeitgesetz, in Minuten:
     §4 Ruhepausen        mehr als 6 h → 30 min, mehr als 9 h → 45 min
     §3 Hoechstarbeitszeit werktaeglich 8 h, auf bis zu 10 h verlaengerbar */
export const HOECHSTARBEITSZEIT = 10 * 60;

/* ---------- Umrechnung ---------- */

/** 'HH:MM' → Minuten seit Mitternacht. Unbrauchbares ergibt null. */
export function zuMinuten(text) {
  if (text == null) return null;
  const treffer = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  if (!treffer) return null;
  const std = Number(treffer[1]);
  const min = Number(treffer[2]);
  if (std > 23 || min > 59) return null;
  return std * 60 + min;
}

/** Minuten seit Mitternacht → 'HH:MM'. Ueber einen Tag hinaus wird umgebrochen. */
export function zuUhrzeit(minuten) {
  if (minuten == null || !Number.isFinite(minuten)) return '';
  const m = ((Math.round(minuten) % TAG_MINUTEN) + TAG_MINUTEN) % TAG_MINUTEN;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

/** Stunden als Dezimalzahl (7,7) → Minuten (462). */
export function stundenZuMinuten(stunden) {
  if (stunden == null || !Number.isFinite(stunden)) return 0;
  return Math.round(stunden * 60);
}

export function minutenZuStunden(minuten) {
  return (minuten ?? 0) / 60;
}

/**
 * Minuten als Stundenangabe: 495 → „8:15 h", −90 → „−1:30 h".
 * Bewusst nicht dezimal – „8:15" liest sich am Stundenkonto besser als
 * „8,25", weil daneben Uhrzeiten stehen.
 */
export function stundenText(minuten, { vorzeichen = false } = {}) {
  if (minuten == null || !Number.isFinite(minuten)) return '–';
  const gerundet = Math.round(minuten);
  const negativ = gerundet < 0;
  const abs = Math.abs(gerundet);
  const zeichen = negativ ? '−' : vorzeichen && gerundet > 0 ? '+' : '';
  return `${zeichen}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')} h`;
}

/* ---------- Intervalle ---------- */

/**
 * Dauer eines Abschnitts in Minuten. Liegt das Ende vor dem Anfang, geht der
 * Abschnitt ueber Mitternacht – 22:00–06:00 sind acht Stunden, nicht minus
 * sechzehn. Gleiche Zeiten ergeben null Minuten, nicht einen ganzen Tag.
 */
export function intervallDauer(intervall) {
  if (!intervall) return null;
  const von = zuMinuten(intervall.von);
  const bis = zuMinuten(intervall.bis);
  if (von == null || bis == null) return null;
  return bis >= von ? bis - von : bis + TAG_MINUTEN - von;
}

/** Summe aller vollstaendig ausgefuellten Abschnitte. Unvollstaendige zaehlen nicht. */
export function intervalleSumme(intervalle) {
  let summe = 0;
  for (const iv of intervalle || []) {
    const dauer = intervallDauer(iv);
    if (dauer != null) summe += dauer;
  }
  return summe;
}

/** true, sobald ein Abschnitt angefangen, aber nicht zu Ende ausgefuellt ist. */
export function unvollstaendig(intervalle) {
  return (intervalle || []).some((iv) => {
    const von = zuMinuten(iv?.von);
    const bis = zuMinuten(iv?.bis);
    return (von == null) !== (bis == null);
  });
}

/**
 * Paare von Abschnitten, die sich zeitlich ueberschneiden – zurueckgegeben als
 * Indizes. Fuer den Vergleich wird jeder Abschnitt auf einen Zahlenstrahl
 * gelegt; einer ueber Mitternacht reicht dann ueber 1440 hinaus und
 * ueberschneidet sich richtig mit einem Abschnitt am spaeten Abend.
 */
export function ueberschneidungen(intervalle) {
  const strecken = [];
  (intervalle || []).forEach((iv, i) => {
    const von = zuMinuten(iv?.von);
    const dauer = intervallDauer(iv);
    if (von == null || dauer == null || dauer === 0) return;
    strecken.push({ i, a: von, b: von + dauer });
  });

  const treffer = [];
  for (let x = 0; x < strecken.length; x++) {
    for (let y = x + 1; y < strecken.length; y++) {
      const s = strecken[x];
      const t = strecken[y];
      // Der zweite Abschnitt kann am Vortag begonnen haben; deshalb beide
      // Verschiebungen pruefen, sonst entgeht 23:00–01:00 gegen 00:30–02:00.
      const trifft = (p, q) => p.a < q.b && q.a < p.b;
      if (trifft(s, t) || trifft({ a: s.a + TAG_MINUTEN, b: s.b + TAG_MINUTEN }, t)
        || trifft(s, { a: t.a + TAG_MINUTEN, b: t.b + TAG_MINUTEN })) {
        treffer.push([s.i, t.i]);
      }
    }
  }
  return treffer;
}

/**
 * Pausen, die als Luecke zwischen zwei Abschnitten stecken – in Minuten.
 *
 * Die Luecke zwischen zwei Abschnitten *ist* eine Pause (so steht es auch
 * in der Erfassung), sie muss deshalb bei der gesetzlichen Mindestpause
 * mitzaehlen. Sonst meldete jeder Tag, der mit der Stempeluhr in zwei
 * Abschnitten erfasst wurde, faelschlich eine zu kurze Pause.
 *
 * Gezaehlt wird nach ArbZG §4 nur, was mindestens 15 Minuten am Stueck
 * dauert. Die Abschnitte werden in der eingetragenen Reihenfolge gelesen;
 * beginnt einer frueher als sein Vorgaenger, liegt er nach Mitternacht.
 */
export function pausenLuecken(intervalle) {
  const strecken = [];
  for (const iv of intervalle || []) {
    const von = zuMinuten(iv?.von);
    const dauer = intervallDauer(iv);
    if (von == null || !dauer) continue;
    let a = von;
    const vorher = strecken[strecken.length - 1];
    while (vorher && a < vorher.a) a += TAG_MINUTEN;
    strecken.push({ a, b: a + dauer });
  }
  let summe = 0;
  for (let i = 1; i < strecken.length; i++) {
    const luecke = strecken[i].a - strecken[i - 1].b;
    if (luecke >= 15) summe += luecke;
  }
  return summe;
}

/* ---------- Gesetzliche Grenzen ---------- */

/**
 * Vorgeschriebene Ruhepause nach ArbZG §4, bezogen auf die *reine*
 * Arbeitszeit ohne Pause. Sechs Stunden genau sind noch pausenfrei erlaubt,
 * erst „mehr als" sechs Stunden loesen die Pflicht aus.
 */
export function mindestpause(arbeitsMinuten) {
  if (arbeitsMinuten > 9 * 60) return 45;
  if (arbeitsMinuten > 6 * 60) return 30;
  return 0;
}

/* ---------- Tagesrechnung ---------- */

export const WARNTEXTE = {
  pause: 'Die Pause ist kürzer als gesetzlich vorgeschrieben.',
  hoechstzeit: 'Mehr als 10 Stunden Arbeitszeit – über der werktäglichen Höchstgrenze.',
  ueberschneidung: 'Zwei Abschnitte überschneiden sich.',
  unvollstaendig: 'Ein Abschnitt ist nur halb ausgefüllt.',
  negativ: 'Die Pause ist länger als die erfasste Zeit.',
  ohneProjekt: 'Mindestens ein Abschnitt ist keinem Projekt zugeordnet.',
};

/**
 * Rechnet einen erfassten Tag aus und sammelt die Beanstandungen.
 * Zurueck kommen nur Kennungen, keine Saetze – die Texte stehen in
 * WARNTEXTE, damit dieses Modul ohne Oberflaeche auskommt.
 *
 * Zu kurze Pausen werden gemeldet, aber nie stillschweigend abgezogen:
 * gerechnet wird, was dasteht. Alles andere wuerde Zahlen erzeugen, die
 * der Nutzer in seiner eigenen Eingabe nicht wiederfindet.
 *
 * opts.projektpflicht kommt von aussen (Stammdaten des Betriebs, siehe
 * server/stammdaten.js) – dieses Modul kennt keine Projektliste, nur den
 * Schalter. Beanstandet, nicht blockiert: dieselbe Haltung wie bei der
 * zu kurzen Pause.
 */
export function tageszeit(tag, { projektpflicht = false } = {}) {
  const intervalle = tag?.intervalle || [];
  const bruttoMin = intervalleSumme(intervalle);
  const pauseMin = Math.max(0, tag?.pauseMin ?? 0);
  const istMin = bruttoMin - pauseMin;
  const warnungen = [];

  if (unvollstaendig(intervalle)) warnungen.push('unvollstaendig');
  if (ueberschneidungen(intervalle).length) warnungen.push('ueberschneidung');
  if (istMin < 0) warnungen.push('negativ');
  // Pausenfeld plus Luecken zwischen den Abschnitten – beides ist Pause.
  if (istMin > 0 && pauseMin + pausenLuecken(intervalle) < mindestpause(istMin)) warnungen.push('pause');
  if (istMin > HOECHSTARBEITSZEIT) warnungen.push('hoechstzeit');
  if (projektpflicht && intervalle.some((iv) => intervallDauer(iv) && !iv.projektId)) {
    warnungen.push('ohneProjekt');
  }

  return { bruttoMin, pauseMin, istMin: Math.max(0, istMin), warnungen };
}
