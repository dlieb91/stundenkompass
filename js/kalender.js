/* Kalender und Feiertage – reine Rechnung, keine Oberflaeche.

   Ein Datum ist in dieser App immer die Zeichenkette 'JJJJ-MM-TT'. Gerechnet
   wird ausschliesslich in UTC (Date.UTC, getUTC*). Das ist kein Detail: mit
   lokaler Zeit verschiebt die Sommerzeitumstellung eine Tagesaddition um eine
   Stunde, und irgendwann faellt ein 31. Maerz auf den 30., weil der Tag nur
   23 Stunden hatte. In UTC gibt es diesen Fall nicht.

   Die beweglichen Feiertage haengen alle am Ostersonntag und werden von dort
   aus abgezaehlt. Der Ostersonntag selbst kommt aus der anonymen gregorianischen
   Osterformel (Meeus/Jones/Butcher), die ohne Tabelle auskommt.
*/

export const MONATSNAMEN = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/* Mo = 0 … So = 6. Der ISO-Woche zuliebe, und weil der Wochenplan so gelesen wird. */
export const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WOCHENTAGE_LANG = [
  'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag',
];

/* ---------- Datum ---------- */

export function ausISO(iso) {
  const [j, m, t] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(j, (m || 1) - 1, t || 1));
}

export function isoTag(date) {
  return date.toISOString().slice(0, 10);
}

export function heuteISO() {
  const jetzt = new Date();
  // Der lokale Kalendertag zaehlt, nicht der UTC-Tag – sonst waere kurz nach
  // Mitternacht noch „gestern".
  return `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`;
}

export function tagePlus(iso, n) {
  const d = ausISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoTag(d);
}

/** Mo = 0 … So = 6 */
export function wochentag(iso) {
  return (ausISO(iso).getUTCDay() + 6) % 7;
}

export function istWochenende(iso) {
  return wochentag(iso) >= 5;
}

export function jahrVon(iso) { return Number(String(iso).slice(0, 4)); }
export function monatVon(iso) { return Number(String(iso).slice(5, 7)); }

/** Monat 1..12 */
export function tageImMonat(jahr, monat) {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}

/** Alle Tage eines Monats als ISO-Liste. Monat 1..12 */
export function monatsTage(jahr, monat) {
  const anzahl = tageImMonat(jahr, monat);
  const liste = [];
  for (let t = 1; t <= anzahl; t++) {
    liste.push(`${jahr}-${String(monat).padStart(2, '0')}-${String(t).padStart(2, '0')}`);
  }
  return liste;
}

export function monatsBezeichnung(jahr, monat) {
  return `${MONATSNAMEN[monat - 1]} ${jahr}`;
}

/** Monat um n verschieben, ueber Jahresgrenzen hinweg. */
export function monatPlus(jahr, monat, n) {
  const roh = (jahr * 12 + (monat - 1)) + n;
  return { jahr: Math.floor(roh / 12), monat: (roh % 12) + 1 };
}

/**
 * Kalenderwoche nach ISO 8601: Woche 1 ist die mit dem ersten Donnerstag des
 * Jahres. Deshalb wird vom Datum aus auf den Donnerstag derselben Woche
 * gesprungen und erst dort das Jahr bestimmt – sonst bekaeme der 1. Januar
 * eines Jahres, das mit einem Freitag beginnt, faelschlich die Woche 1.
 */
export function kwNummer(iso) {
  const d = ausISO(iso);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const jahresanfang = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - jahresanfang) / 86400000 + 1) / 7);
}

/* ---------- Feiertage ---------- */

export const BUNDESLAENDER = [
  { id: 'BW', name: 'Baden-Württemberg' },
  { id: 'BY', name: 'Bayern' },
  { id: 'BE', name: 'Berlin' },
  { id: 'BB', name: 'Brandenburg' },
  { id: 'HB', name: 'Bremen' },
  { id: 'HH', name: 'Hamburg' },
  { id: 'HE', name: 'Hessen' },
  { id: 'MV', name: 'Mecklenburg-Vorpommern' },
  { id: 'NI', name: 'Niedersachsen' },
  { id: 'NW', name: 'Nordrhein-Westfalen' },
  { id: 'RP', name: 'Rheinland-Pfalz' },
  { id: 'SL', name: 'Saarland' },
  { id: 'SN', name: 'Sachsen' },
  { id: 'ST', name: 'Sachsen-Anhalt' },
  { id: 'SH', name: 'Schleswig-Holstein' },
  { id: 'TH', name: 'Thüringen' },
];

/** Ostersonntag eines Jahres als ISO-Datum (anonyme gregorianische Osterformel). */
export function ostersonntag(jahr) {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return isoTag(new Date(Date.UTC(jahr, monat - 1, tag)));
}

/**
 * Buss- und Bettag: der Mittwoch vor dem 23. November. Faellt der 23. selbst
 * auf einen Mittwoch, ist der Feiertag eine Woche vorher – deshalb wird vom
 * 22. aus rueckwaerts gesucht und nicht vom 23.
 */
export function bussUndBettag(jahr) {
  let iso = `${jahr}-11-22`;
  while (wochentag(iso) !== 2) iso = tagePlus(iso, -1);
  return iso;
}

/**
 * Alle gesetzlichen Feiertage eines Jahres im gewaehlten Bundesland als
 * Map iso → Name. Nicht abgebildet sind die gemeindeweise geltenden
 * Sonderfaelle (Fronleichnam in Sachsen und Thueringen, Maria Himmelfahrt in
 * Bayern) – die traegt man bei Bedarf als einzelnen Tag von Hand ein.
 */
export function feiertage(jahr, land) {
  const o = ostersonntag(jahr);
  const karte = new Map();
  const setze = (iso, name, laender) => {
    if (!laender || laender.includes(land)) karte.set(iso, name);
  };

  setze(`${jahr}-01-01`, 'Neujahr');
  setze(`${jahr}-01-06`, 'Heilige Drei Könige', ['BW', 'BY', 'ST']);
  setze(`${jahr}-03-08`, 'Internationaler Frauentag', ['BE', 'MV']);
  setze(tagePlus(o, -2), 'Karfreitag');
  setze(o, 'Ostersonntag', ['BB']);
  setze(tagePlus(o, 1), 'Ostermontag');
  setze(`${jahr}-05-01`, 'Tag der Arbeit');
  setze(tagePlus(o, 39), 'Christi Himmelfahrt');
  setze(tagePlus(o, 49), 'Pfingstsonntag', ['BB']);
  setze(tagePlus(o, 50), 'Pfingstmontag');
  setze(tagePlus(o, 60), 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']);
  setze(`${jahr}-08-15`, 'Mariä Himmelfahrt', ['SL']);
  setze(`${jahr}-09-20`, 'Weltkindertag', ['TH']);
  setze(`${jahr}-10-03`, 'Tag der Deutschen Einheit');
  setze(`${jahr}-10-31`, 'Reformationstag', ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']);
  setze(`${jahr}-11-01`, 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']);
  setze(bussUndBettag(jahr), 'Buß- und Bettag', ['SN']);
  setze(`${jahr}-12-25`, '1. Weihnachtstag');
  setze(`${jahr}-12-26`, '2. Weihnachtstag');

  return karte;
}
