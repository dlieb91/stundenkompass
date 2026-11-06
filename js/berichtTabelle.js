/* Monatsbericht als Excel-Mappe – reines Modul, ohne DOM.

   Nimmt das Ergebnis von monatsbericht() und beschreibt daraus eine Mappe
   fuer xlsx.js. Inhalt wie der PDF-Bericht, dazu zwei Blaetter zum
   Weiterarbeiten:

     Monatsbericht  Kopf, Kennzahlen, ein Tag je Zeile, Stundenkonto,
                    Urlaub, Hinweise, Unterschriften – druckfertig auf eine
                    Seitenbreite
     Buchungen      ein erfasster Abschnitt je Zeile, mit Filter – fuer
                    Pivot, Abrechnung, eigene Auswertungen
     Projekte       Stunden je Projekt aus den Buchungen (nur, wenn im Monat
                    ein Projekt gebucht ist)

   Regeln aus der Tabellen-Vorlage (zahlenkompass-tabelle):
     – Salden sind ganze Minuten in einer versteckten Spalte; angezeigt als
       Textformel. Excel kann negative Zeitwerte nicht darstellen.
     – Ist, Soll, Pause, Dauer sind echte Zeitwerte ([h]:mm) – man kann mit
       ihnen weiterrechnen.
     – Summen, Kontostand und Projektstunden sind Formeln, keine
       abgeschriebenen Zahlen. Wer in der Datei eine Zeit korrigiert, sieht
       die Summe mitgehen.
     – Nur Funktionen, die Excel und Google Sheets beide kennen. */

import { datumsZahl, uhrzeitZahl } from './xlsx.js';

/* ---------- Farben (wie die Jahresmappe und der Kalender) ---------- */

const NAVY = '14213D';
const NAVY_HELL = 'C8D3E6';
const GOLD = 'C9A227';
const PAPIER = 'F7F5F0';
const GRAU = '5B6779';
const GRAU_HELL = '8794A7';
const LINIE = 'E1E5EC';
const FREI_HG = 'F1F3F7';
const GRUEN = '15803D';
const ROT = 'B91C1C';
const WEISS = 'FFFFFF';

const ARTFARBE = {
  urlaub: ['FDF0C4', '7A5A00'],
  urlaubHalb: ['FDF0C4', '7A5A00'],
  krank: ['FBE0DE', '9B2C24'],
  feiertag: ['E4E8FB', '33408F'],
  ausgleich: ['DFF1F8', '0B5872'],
};

/* ---------- Stile ---------- */

const linieUnten = { unten: 'thin', farbe: LINIE };
const S = {
  marke: { schrift: { fett: true, groesse: 8, farbe: GOLD }, fuellung: NAVY, ausrichtung: { v: 'bottom', h: 'left', einzug: 1 } },
  titel: { schrift: { fett: true, groesse: 18, farbe: WEISS }, fuellung: NAVY, ausrichtung: { v: 'center', h: 'left', einzug: 1 } },
  person: { schrift: { groesse: 10, farbe: NAVY_HELL }, fuellung: NAVY, ausrichtung: { v: 'top', h: 'left', einzug: 1 } },
  goldband: { fuellung: GOLD },
  hinweis: { schrift: { groesse: 9, farbe: '7A5A00', kursiv: true }, fuellung: 'FDF6DD', ausrichtung: { v: 'center', h: 'left', einzug: 1 } },

  kpiLabel: {
    schrift: { groesse: 8, farbe: GRAU_HELL, fett: true }, fuellung: PAPIER,
    rahmen: { oben: 'medium', links: 'medium', rechts: 'medium', farbe: WEISS }, ausrichtung: { v: 'bottom', h: 'left', einzug: 1 },
  },
  kpiZeit: {
    schrift: { groesse: 18, farbe: NAVY, fett: true }, fuellung: PAPIER, format: '[h]:mm',
    rahmen: { links: 'medium', rechts: 'medium', farbe: WEISS }, ausrichtung: { h: 'left', v: 'center', einzug: 1 },
  },
  kpiText: {
    schrift: { groesse: 18, farbe: NAVY, fett: true }, fuellung: PAPIER,
    rahmen: { links: 'medium', rechts: 'medium', farbe: WEISS }, ausrichtung: { h: 'left', v: 'center', einzug: 1 },
  },
  kpiZahl: {
    schrift: { groesse: 18, farbe: NAVY, fett: true }, fuellung: PAPIER, format: '0.0',
    rahmen: { links: 'medium', rechts: 'medium', farbe: WEISS }, ausrichtung: { h: 'left', v: 'center', einzug: 1 },
  },
  kpiSub: {
    schrift: { groesse: 8, farbe: GRAU_HELL }, fuellung: PAPIER,
    rahmen: { unten: 'medium', links: 'medium', rechts: 'medium', farbe: WEISS }, ausrichtung: { v: 'top', h: 'left', einzug: 1 },
  },

  h2: { schrift: { fett: true, groesse: 11, farbe: NAVY }, rahmen: { unten: 'medium', farbe: GOLD } },
  kopf: { schrift: { fett: true, groesse: 9, farbe: WEISS }, fuellung: NAVY, ausrichtung: { h: 'left', v: 'center', einzug: 1 } },
  kopfR: { schrift: { fett: true, groesse: 9, farbe: WEISS }, fuellung: NAVY, ausrichtung: { h: 'right', v: 'center' } },
  kopfM: { schrift: { fett: true, groesse: 9, farbe: WEISS }, fuellung: NAVY, ausrichtung: { h: 'center', v: 'center' } },

  summeL: {
    schrift: { fett: true, groesse: 10, farbe: NAVY }, fuellung: PAPIER,
    rahmen: { oben: 'medium', unten: 'medium', farbe: NAVY }, ausrichtung: { v: 'center', h: 'left', einzug: 1 },
  },
  summeZeit: {
    schrift: { fett: true, groesse: 10, farbe: NAVY }, fuellung: PAPIER, format: '[h]:mm',
    rahmen: { oben: 'medium', unten: 'medium', farbe: NAVY }, ausrichtung: { h: 'right', v: 'center' },
  },
  summeText: {
    schrift: { fett: true, groesse: 10, farbe: NAVY }, fuellung: PAPIER,
    rahmen: { oben: 'medium', unten: 'medium', farbe: NAVY }, ausrichtung: { h: 'right', v: 'center' },
  },

  kastenL: { schrift: { groesse: 9, farbe: GRAU }, rahmen: linieUnten, ausrichtung: { h: 'left', einzug: 1 } },
  kastenW: { schrift: { groesse: 9 }, rahmen: linieUnten, ausrichtung: { h: 'right' } },
  kastenTage: { schrift: { groesse: 9 }, rahmen: linieUnten, ausrichtung: { h: 'right' }, format: '0.0" Tage"' },
  kastenAnzahl: { schrift: { groesse: 9 }, rahmen: linieUnten, ausrichtung: { h: 'right' } },
  kastenSummeL: { schrift: { groesse: 9, fett: true, farbe: NAVY }, fuellung: PAPIER, ausrichtung: { h: 'left', einzug: 1 } },
  kastenSummeW: { schrift: { groesse: 9, fett: true, farbe: NAVY }, fuellung: PAPIER, ausrichtung: { h: 'right' } },
  kastenSummeTage: { schrift: { groesse: 9, fett: true, farbe: NAVY }, fuellung: PAPIER, ausrichtung: { h: 'right' }, format: '0.0" Tage"' },

  text9: { schrift: { groesse: 9 }, ausrichtung: { v: 'top', umbruch: true, h: 'left', einzug: 1 } },
  unter: { schrift: { groesse: 9, farbe: GRAU_HELL } },
  fein: { schrift: { groesse: 8, farbe: GRAU_HELL }, ausrichtung: { v: 'top', umbruch: true } },
  unterschrift: { rahmen: { unten: 'thin', farbe: GRAU } },
  unterschriftText: { schrift: { groesse: 8, farbe: GRAU_HELL } },

  minuten: { format: '0' },
};

/* Eine Tageszeile in einer Grundfarbe: alle Zellen bekommen dieselbe
   Fuellung und Linie, nur Format und Ausrichtung unterscheiden sich. */
function zeilenStil(basis, extra = {}) {
  return {
    ...extra,
    fuellung: extra.fuellung || basis.fuellung,
    schrift: { groesse: 9, ...basis.schrift, ...extra.schrift },
    rahmen: linieUnten,
    ausrichtung: { v: 'center', ...extra.ausrichtung },
  };
}

/* Saldo aus Minuten als Text: +1:30, −0:45, 0:00 */
const saldoFormel = (m, einheit = '') => `IF(${m}="","",IF(${m}=0,"0:00",IF(${m}<0,"−","+")`
  + `&TEXT(INT(ABS(${m})/60),"0")&":"&TEXT(MOD(ABS(${m}),60),"00"))${einheit ? `&"${einheit}"` : ''})`;

const zwei = (n) => String(n).padStart(2, '0');
const datumText = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/* ---------- Monatsbericht ---------- */

/* Spalten: A Datum · B Tag · C Art · D Arbeitszeit · E Pause · F Ist · G Soll
   · H Saldo · I Projekt · J Notiz · K Saldo in Minuten (versteckt)
   · L zaehlt 1/0 (versteckt) */
const SP = {
  datum: 0, tag: 1, art: 2, zeiten: 3, pause: 4, ist: 5, soll: 6, saldo: 7, projekt: 8, notiz: 9, min: 10, zaehlt: 11,
};

function berichtBlatt(r, { heute }) {
  const zeilen = [];
  const verbunden = [];
  const bedingt = [];
  const z = (nr, zellen, hoehe) => { zeilen[nr - 1] = { zellen, hoehe }; };
  const zelle = (zellen, sp, wert) => { zellen[sp] = wert; };
  const leer = (n, s) => Array.from({ length: n }, () => ({ w: '', s }));

  /* Kopf */
  z(1, [{ w: 'STUNDENKOMPASS', s: S.marke }, ...leer(9, S.marke)], 18);
  verbunden.push('A1:J1');
  z(2, [{ w: `Monatsbericht ${r.titel}`, s: S.titel }, ...leer(9, S.titel)], 30);
  verbunden.push('A2:J2');
  const person = [r.name, r.zeitmodell, `Zeitraum ${datumText(r.erster)} – ${datumText(r.letzter)}`].filter(Boolean).join('   ·   ');
  z(3, [{ w: person, s: S.person }, ...leer(9, S.person)], 22);
  verbunden.push('A3:J3');
  z(4, leer(10, S.goldband), 4);

  if (r.laufend && !r.zukunft) {
    z(5, [{ w: `Stand ${datumText(r.stichtag)}: Der Monat ist noch nicht abgeschlossen. Tage nach dem ${datumText(r.stichtag)} zählen noch nicht.`, s: S.hinweis }, ...leer(9, S.hinweis)], 20);
    verbunden.push('A5:J5');
  } else {
    z(5, [], 8);
  }
  z(6, [], 8);

  /* Tabelle zuerst festlegen – die Kennzahlen oben lesen ihre Summen. */
  const KOPF = 11;
  const ERSTE = KOPF + 1;
  const LETZTE = ERSTE + r.zeilen.length - 1;
  const SUMME = LETZTE + 1;
  const bereich = (sp) => `${'ABCDEFGHIJKL'[sp]}$${ERSTE}:${'ABCDEFGHIJKL'[sp]}$${LETZTE}`;

  /* Kennzahlen: sechs Kacheln, je Label / Wert / Unterzeile */
  const kacheln = [
    { von: 'A', bis: 'B', label: 'IST', wert: { f: `F${SUMME}`, s: S.kpiZeit }, sub: 'Stunden gearbeitet' },
    { von: 'C', bis: 'C', label: 'SOLL', wert: { f: `G${SUMME}`, s: S.kpiZeit }, sub: r.laufend ? `bis ${datumText(r.stichtag)}` : 'im Monat' },
    { von: 'D', bis: 'D', label: 'SALDO MONAT', wert: { f: `H${SUMME}`, s: S.kpiText }, sub: 'Ist minus Soll', kSaldo: `$K$${SUMME}` },
    { von: 'E', bis: 'G', label: 'STUNDENKONTO', wert: { f: 'H_KONTO', s: S.kpiText }, sub: `Stand ${datumText(r.zukunft ? r.erster : r.stichtag)}`, kSaldo: 'K_KONTO' },
    { von: 'H', bis: 'I', label: `URLAUB ${r.urlaub.jahr}`, wert: { w: r.urlaub.verbleibend, s: S.kpiZahl }, sub: `Tage übrig von ${fmtTage(r.urlaub.gesamt)}` },
    { von: 'J', bis: 'J', label: 'URLAUB · KRANK', wert: { w: abwesenheitText(r.summen), s: S.kpiText }, sub: 'Tage in diesem Monat' },
  ];
  const kz = { 7: [], 8: [], 9: [] };
  const spIdx = (b) => b.charCodeAt(0) - 65;
  for (const k of kacheln) {
    for (let i = spIdx(k.von); i <= spIdx(k.bis); i++) {
      kz[7][i] = { w: i === spIdx(k.von) ? k.label : '', s: S.kpiLabel };
      kz[8][i] = i === spIdx(k.von) ? k.wert : { w: '', s: k.wert.s };
      kz[9][i] = { w: i === spIdx(k.von) ? k.sub : '', s: S.kpiSub };
    }
    if (k.von !== k.bis) for (const n of [7, 8, 9]) verbunden.push(`${k.von}${n}:${k.bis}${n}`);
  }
  z(7, kz[7], 18);
  z(8, kz[8], 30);
  z(9, kz[9], 16);
  z(10, [], 12);

  /* Tabellenkopf */
  const kopf = [];
  kopf[SP.datum] = { w: 'Datum', s: S.kopf };
  kopf[SP.tag] = { w: 'Tag', s: S.kopfM };
  kopf[SP.art] = { w: 'Art', s: S.kopf };
  kopf[SP.zeiten] = { w: 'Arbeitszeit', s: S.kopf };
  kopf[SP.pause] = { w: 'Pause', s: S.kopfR };
  kopf[SP.ist] = { w: 'Ist', s: S.kopfR };
  kopf[SP.soll] = { w: 'Soll', s: S.kopfR };
  kopf[SP.saldo] = { w: 'Saldo', s: S.kopfR };
  kopf[SP.projekt] = { w: 'Projekt', s: S.kopf };
  kopf[SP.notiz] = { w: 'Notiz', s: S.kopf };
  z(KOPF, kopf, 22);

  /* Tage */
  r.zeilen.forEach((t, i) => {
    const nr = ERSTE + i;
    const grau = t.frei && !t.explizit;
    const basis = !t.zaehlt
      ? { fuellung: WEISS, schrift: { farbe: GRAU_HELL, kursiv: true } }
      : grau ? { fuellung: FREI_HG, schrift: { farbe: GRAU } } : { fuellung: WEISS, schrift: { farbe: '1F2937' } };
    const art = (t.art === 'arbeit' || t.art === 'frei') && !t.explizit ? '' : t.artText;
    const artFarbe = t.zaehlt && ARTFARBE[t.art];
    const zaehltZahl = t.zaehlt && (t.sollMin || t.istMin);
    const zeitenText = t.zeiten.length ? t.zeiten.join(', ') : t.luecke ? 'nicht erfasst' : '';

    const c = [];
    zelle(c, SP.datum, { w: datumsZahl(t.iso), s: zeilenStil(basis, { format: 'DD.MM.YYYY', ausrichtung: { h: 'left', einzug: 1 } }) });
    zelle(c, SP.tag, { w: t.wochentag, s: zeilenStil(basis, { ausrichtung: { h: 'center' } }) });
    zelle(c, SP.art, {
      w: art,
      s: zeilenStil(basis, artFarbe
        ? { fuellung: artFarbe[0], schrift: { farbe: artFarbe[1], fett: true }, ausrichtung: { h: 'left', einzug: 1 } }
        : { ausrichtung: { h: 'left', einzug: 1 } }),
    });
    zelle(c, SP.zeiten, {
      w: zeitenText,
      s: zeilenStil(basis, t.luecke ? { schrift: { farbe: ROT, kursiv: true }, ausrichtung: { h: 'left', einzug: 1 } } : { ausrichtung: { h: 'left', einzug: 1, umbruch: t.zeiten.length > 2 } }),
    });
    const zeitStil = zeilenStil(basis, { format: '[h]:mm', ausrichtung: { h: 'right' } });
    zelle(c, SP.pause, { w: t.pauseMin ? t.pauseMin / 1440 : '', s: zeitStil });
    zelle(c, SP.ist, { w: t.istMin ? t.istMin / 1440 : '', s: zeitStil });
    zelle(c, SP.soll, { w: t.sollMin ? t.sollMin / 1440 : '', s: zeitStil });
    zelle(c, SP.saldo, { f: saldoFormel(`K${nr}`), s: zeilenStil(basis, { ausrichtung: { h: 'right' }, schrift: { fett: true } }) });
    zelle(c, SP.projekt, { w: t.projekte.join(', '), s: zeilenStil(basis, { ausrichtung: { h: 'left', einzug: 1 } }) });
    zelle(c, SP.notiz, { w: t.notiz, s: zeilenStil(basis, { ausrichtung: { h: 'left', einzug: 1 } }) });
    zelle(c, SP.min, { w: zaehltZahl && (t.istMin || t.saldoMin) ? t.saldoMin : '', s: S.minuten });
    zelle(c, SP.zaehlt, { w: t.zaehlt ? 1 : 0, s: S.minuten });
    // Zwei Abschnitte passen in eine Zeile, jedes weitere Paar braucht eine mehr.
    z(nr, c, t.zeiten.length > 2 ? 13 * Math.ceil(t.zeiten.length / 2) + 4 : 17);
  });

  /* Summe: nur Tage, die zaehlen (Spalte L) */
  const s = [];
  s[SP.datum] = { w: 'Summe', s: S.summeL };
  for (const sp of [SP.tag, SP.art, SP.zeiten, SP.pause]) s[sp] = { w: '', s: S.summeL };
  s[SP.ist] = { f: `SUMIF(${bereich(SP.zaehlt)},1,${bereich(SP.ist)})`, s: S.summeZeit };
  s[SP.soll] = { f: `SUMIF(${bereich(SP.zaehlt)},1,${bereich(SP.soll)})`, s: S.summeZeit };
  s[SP.saldo] = { f: saldoFormel(`K${SUMME}`), s: S.summeText };
  s[SP.projekt] = { w: '', s: S.summeL };
  s[SP.notiz] = { w: '', s: S.summeL };
  s[SP.min] = { f: `SUM(${bereich(SP.min)})`, s: S.minuten };
  z(SUMME, s, 22);
  verbunden.push(`A${SUMME}:E${SUMME}`);

  /* Saldo farbig: rot unter null, gruen darueber */
  const saldoBereich = `H${ERSTE}:H${SUMME}`;
  bedingt.push({ bereich: saldoBereich, formel: `AND(ISNUMBER($K${ERSTE}),$K${ERSTE}<0)`, stil: { schrift: { farbe: ROT } } });
  bedingt.push({ bereich: saldoBereich, formel: `AND(ISNUMBER($K${ERSTE}),$K${ERSTE}>0)`, stil: { schrift: { farbe: GRUEN } } });

  /* Kaesten: links Stundenkonto und Im Monat (A–C Text, D Wert),
     rechts Urlaub (F–I Text, J Wert). Spalte E bleibt als Abstand frei. */
  let nr = SUMME + 2;
  const k = r.konto;
  const u = r.urlaub;
  const kasten = {};
  const reihe = (n) => (kasten[n] ||= []);
  const titel = (n, sp0, sp1, text) => {
    for (let sp = sp0; sp <= sp1; sp++) reihe(n)[sp] = { w: sp === sp0 ? text : '', s: S.h2 };
    verbunden.push(`${'ABCDEFGHIJ'[sp0]}${n}:${'ABCDEFGHIJ'[sp1]}${n}`);
  };
  const posten = (n, sp0, sp1, text, wert, summe) => {
    for (let sp = sp0; sp < sp1; sp++) reihe(n)[sp] = { w: sp === sp0 ? text : '', s: summe ? S.kastenSummeL : S.kastenL };
    reihe(n)[sp1] = { ...wert, s: wert.s || (summe ? S.kastenSummeW : S.kastenW) };
    verbunden.push(`${'ABCDEFGHIJ'[sp0]}${n}:${'ABCDEFGHIJ'[sp1 - 1]}${n}`);
  };

  /* links: Stundenkonto */
  titel(nr, 0, 3, 'Stundenkonto');
  const kontoErste = nr + 1;
  const konto = [
    [k.vorherIstAnfangsbestand ? 'Anfangsbestand' : `Stand ${datumText(tageVorher(r.erster))}`, { w: k.vorherMin }],
    [`Saldo ${r.titel}`, { f: `K${SUMME}` }],
    [`Stand ${datumText(r.zukunft ? r.erster : r.stichtag)}`, { f: `K${kontoErste}+K${kontoErste + 1}` }],
  ];
  konto.forEach(([text, minuten], i) => {
    const n = kontoErste + i;
    const summe = i === konto.length - 1;
    posten(n, 0, 3, text, { f: saldoFormel(`K${n}`, ' h') }, summe);
    reihe(n)[SP.min] = { ...minuten, s: S.minuten };
    if (summe) {
      bedingt.push({ bereich: `D${n}`, formel: `$K${n}<0`, stil: { schrift: { farbe: ROT } } });
      bedingt.push({ bereich: `D${n}`, formel: `$K${n}>0`, stil: { schrift: { farbe: GRUEN } } });
    }
  });
  const kontoStand = kontoErste + konto.length - 1;

  /* links darunter: Im Monat */
  const imMonat = kontoStand + 2;
  titel(imMonat, 0, 3, 'Im Monat');
  [
    ['Urlaubstage', r.summen.urlaubTage],
    ['Krankheitstage', r.summen.krankTage],
    ['nicht erfasste Arbeitstage', r.summen.luecken],
  ].forEach(([text, wert], i) => posten(imMonat + 1 + i, 0, 3, text, { w: wert, s: S.kastenAnzahl }, false));

  /* rechts: Urlaub */
  titel(nr, 5, 9, `Urlaub ${u.jahr}`);
  [
    ['Anspruch inkl. Übertrag', u.gesamt],
    ...(u.vorher ? [['vor Erfassungsbeginn genommen', u.vorher]] : []),
    [`genommen bis ${datumText(r.stichtag)}`, u.genommen],
    ...(u.geplant ? [['danach geplant', u.geplant]] : []),
    ['verbleibend', u.verbleibend, true],
  ].forEach(([text, wert, summe], i) => posten(nr + 1 + i, 5, 9, text, { w: wert, s: summe ? S.kastenSummeTage : S.kastenTage }, summe));

  const kastenEnde = Math.max(...Object.keys(kasten).map(Number));
  for (const [n, zellen] of Object.entries(kasten)) z(Number(n), zellen, Number(n) === nr ? 22 : 18);
  nr = kastenEnde;

  /* Hinweise zu einzelnen Tagen */
  if (r.beanstandungen.length) {
    nr += 2;
    z(nr, [{ w: 'Hinweise zu einzelnen Tagen', s: S.h2 }, ...leer(9, S.h2)], 22);
    verbunden.push(`A${nr}:J${nr}`);
    for (const b of r.beanstandungen) {
      nr++;
      z(nr, [{ w: `${datumText(b.iso)}:  ${b.texte.join(' ')}`, s: S.text9 }], 16);
      verbunden.push(`A${nr}:J${nr}`);
    }
  }

  /* Unterschriften */
  nr += 3;
  const u1 = [];
  for (const sp of [0, 1, 2, 3]) u1[sp] = { w: '', s: S.unterschrift };
  for (const sp of [6, 7, 8, 9]) u1[sp] = { w: '', s: S.unterschrift };
  z(nr, u1, 28);
  nr++;
  const u2 = [];
  u2[0] = { w: 'Datum, Unterschrift Mitarbeiter/in', s: S.unterschriftText };
  u2[6] = { w: 'Datum, Unterschrift Arbeitgeber', s: S.unterschriftText };
  z(nr, u2, 14);

  nr += 2;
  z(nr, [{
    w: `Erstellt am ${datumText(heute)} mit StundenKompass. Ist = Arbeitszeit abzüglich Pause; Pause = Lücken `
      + 'zwischen den Abschnitten plus eingetragene Pause. Urlaub, Krankheit und Feiertage werden mit dem Soll '
      + 'gutgeschrieben. Summen und Kontostand sind Formeln und rechnen mit, wenn eine Zeit geändert wird.',
    s: S.fein,
  }], 34);
  verbunden.push(`A${nr}:J${nr}`);

  return {
    blatt: {
      name: 'Monatsbericht',
      registerfarbe: NAVY,
      gitternetz: false,
      aktiv: true,
      druck: { quer: false, eineSeite: true },
      spalten: [
        { breite: 12 }, { breite: 5 }, { breite: 17 }, { breite: 25 }, { breite: 8 },
        { breite: 8 }, { breite: 8 }, { breite: 9 }, { breite: 16 }, { breite: 30 },
        { versteckt: true }, { versteckt: true },
      ],
      zeilen,
      verbunden,
      bedingt,
    },
    kontoStand,
    summeZeile: SUMME,
  };
}

function fmtTage(n) {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

function abwesenheitText(summen) {
  return `${fmtTage(summen.urlaubTage || 0)} · ${summen.krankTage || 0}`;
}

function tageVorher(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* ---------- Buchungen ---------- */

function buchungenListe(daten, r, projekt) {
  const liste = [];
  for (const t of r.zeilen) {
    const tag = daten?.tage?.[t.iso];
    for (const iv of tag?.intervalle || []) {
      if (!iv?.von) continue;
      const p = iv.projektId ? projekt(iv.projektId) : null;
      liste.push({
        iso: t.iso, wochentag: t.wochentag, von: iv.von, bis: iv.bis || '',
        projekt: p?.bezeichnung || '', kunde: p?.kunde || '', notiz: tag.notiz || '',
      });
    }
  }
  return liste;
}

function buchungenBlatt(r, buchungen) {
  const zeilen = [];
  const KOPF = 4;
  const ERSTE = KOPF + 1;
  const LETZTE = Math.max(ERSTE, ERSTE + buchungen.length - 1);
  zeilen[0] = { zellen: [{ w: `Buchungen ${r.titel}`, s: { schrift: { fett: true, groesse: 14, farbe: NAVY } } }], hoehe: 24 };
  zeilen[1] = {
    zellen: [{ w: `${r.name ? r.name + ' · ' : ''}ein erfasster Abschnitt je Zeile. Dauer = Bis − Von, eingetragene Pausen sind nicht abgezogen.`, s: S.unter }],
    hoehe: 16,
  };
  const kopf = ['Datum', 'Tag', 'Von', 'Bis', 'Dauer', 'Projekt', 'Kunde', 'Notiz']
    .map((w, i) => ({ w, s: [2, 3, 4].includes(i) ? S.kopfR : i === 1 ? S.kopfM : S.kopf }));
  zeilen[KOPF - 1] = { zellen: kopf, hoehe: 22 };

  buchungen.forEach((b, i) => {
    const nr = ERSTE + i;
    const zebra = i % 2 ? { fuellung: 'FAFBFC' } : { fuellung: WEISS };
    const st = (extra) => zeilenStil(zebra, extra);
    zeilen[nr - 1] = {
      hoehe: 17,
      zellen: [
        { w: datumsZahl(b.iso), s: st({ format: 'DD.MM.YYYY', ausrichtung: { h: 'left', einzug: 1 } }) },
        { w: b.wochentag, s: st({ ausrichtung: { h: 'center' } }) },
        { w: uhrzeitZahl(b.von), s: st({ format: 'hh:mm', ausrichtung: { h: 'right' } }) },
        { w: b.bis ? uhrzeitZahl(b.bis) : '', s: st({ format: 'hh:mm', ausrichtung: { h: 'right' } }) },
        { f: `IF(D${nr}="","",MOD(D${nr}-C${nr},1))`, s: st({ format: '[h]:mm', ausrichtung: { h: 'right' }, schrift: { fett: true } }) },
        { w: b.projekt, s: st({ ausrichtung: { h: 'left', einzug: 1 } }) },
        { w: b.kunde, s: st({ ausrichtung: { h: 'left', einzug: 1 } }) },
        { w: b.notiz, s: st({ ausrichtung: { h: 'left', einzug: 1 } }) },
      ],
    };
  });
  if (!buchungen.length) {
    zeilen[ERSTE - 1] = { zellen: [{ w: 'In diesem Monat ist keine Arbeitszeit erfasst.', s: S.text9 }] };
  }
  const SUMME = LETZTE + 1;
  zeilen[SUMME - 1] = {
    hoehe: 22,
    zellen: [
      { w: 'Summe', s: S.summeL }, { w: '', s: S.summeL }, { w: '', s: S.summeL }, { w: '', s: S.summeL },
      { f: `SUM(E${ERSTE}:E${LETZTE})`, s: S.summeZeit },
      { w: '', s: S.summeL }, { w: '', s: S.summeL }, { w: '', s: S.summeL },
    ],
  };
  return {
    blatt: {
      name: 'Buchungen',
      registerfarbe: '1E88E5',
      gitternetz: false,
      fixieren: { zeile: KOPF },
      druck: { quer: false },
      filter: buchungen.length ? `A${KOPF}:H${LETZTE}` : null,
      spalten: [{ breite: 12 }, { breite: 5 }, { breite: 8 }, { breite: 8 }, { breite: 9 }, { breite: 22 }, { breite: 22 }, { breite: 36 }],
      zeilen,
      verbunden: [`A${SUMME}:D${SUMME}`],
    },
    filterBereich: buchungen.length ? `'Buchungen'!$A$${KOPF}:$H$${LETZTE}` : null,
    projektBereich: `'Buchungen'!$F$${ERSTE}:$F$${LETZTE}`,
    dauerBereich: `'Buchungen'!$E$${ERSTE}:$E$${LETZTE}`,
  };
}

/* ---------- Projekte ---------- */

function projekteBlatt(r, buchungen) {
  const projekte = [];
  for (const b of buchungen) {
    if (b.projekt && !projekte.some((p) => p.projekt === b.projekt)) projekte.push({ projekt: b.projekt, kunde: b.kunde });
  }
  if (!projekte.length) return null;
  projekte.sort((a, b) => a.projekt.localeCompare(b.projekt, 'de'));

  const zeilen = [];
  zeilen[0] = { zellen: [{ w: `Projekte ${r.titel}`, s: { schrift: { fett: true, groesse: 14, farbe: NAVY } } }], hoehe: 24 };
  zeilen[1] = { zellen: [{ w: 'Stunden je Projekt, summiert aus dem Blatt Buchungen. Pausen sind nicht abgezogen.', s: S.unter }], hoehe: 16 };
  zeilen[3] = {
    hoehe: 22,
    zellen: [{ w: 'Projekt', s: S.kopf }, { w: 'Kunde', s: S.kopf }, { w: 'Stunden', s: S.kopfR }, { w: 'Anteil', s: S.kopfR }],
  };
  const ERSTE = 5;
  const OHNE = ERSTE + projekte.length;
  const SUMME = OHNE + 1;
  const st = (extra) => zeilenStil({ fuellung: WEISS }, extra);
  projekte.forEach((p, i) => {
    const nr = ERSTE + i;
    zeilen[nr - 1] = {
      hoehe: 18,
      zellen: [
        { w: p.projekt, s: st({ ausrichtung: { h: 'left', einzug: 1 }, schrift: { fett: true } }) },
        { w: p.kunde, s: st({ ausrichtung: { h: 'left', einzug: 1 } }) },
        { f: `SUMIF(Buchung_Projekt,A${nr},Buchung_Dauer)`, s: st({ format: '[h]:mm', ausrichtung: { h: 'right' } }) },
        { f: `IF($C$${SUMME}=0,0,C${nr}/$C$${SUMME})`, s: st({ format: '0%', ausrichtung: { h: 'right' } }) },
      ],
    };
  });
  zeilen[OHNE - 1] = {
    hoehe: 18,
    zellen: [
      { w: 'ohne Projekt', s: st({ ausrichtung: { h: 'left', einzug: 1 }, schrift: { kursiv: true, farbe: GRAU } }) },
      { w: '', s: st({}) },
      { f: `C${SUMME}-SUM(C${ERSTE}:C${OHNE - 1})`, s: st({ format: '[h]:mm', ausrichtung: { h: 'right' }, schrift: { farbe: GRAU } }) },
      { f: `IF($C$${SUMME}=0,0,C${OHNE}/$C$${SUMME})`, s: st({ format: '0%', ausrichtung: { h: 'right' }, schrift: { farbe: GRAU } }) },
    ],
  };
  zeilen[SUMME - 1] = {
    hoehe: 22,
    zellen: [
      { w: 'Summe', s: S.summeL }, { w: '', s: S.summeL },
      { f: 'SUM(Buchung_Dauer)', s: S.summeZeit },
      { f: `IF(C${SUMME}=0,0,1)`, s: { ...S.summeZeit, format: '0%' } },
    ],
  };
  return {
    name: 'Projekte',
    registerfarbe: GOLD,
    gitternetz: false,
    druck: { quer: false },
    spalten: [{ breite: 26 }, { breite: 26 }, { breite: 10 }, { breite: 9 }],
    zeilen,
  };
}

/* ---------- Mappe ---------- */

/**
 * r        Ergebnis von monatsbericht()
 * daten    die App-Daten (fuer die einzelnen Abschnitte)
 * opts.heute    ISO, fuer „Erstellt am“
 * opts.projekt  (id) => { bezeichnung, kunde } oder null
 * Liefert { blaetter, namen } fuer mappeSchreiben().
 */
export function berichtMappe(r, daten, { heute, projekt = () => null } = {}) {
  const bericht = berichtBlatt(r, { heute });
  const buchungen = buchungenListe(daten, r, projekt);
  const b = buchungenBlatt(r, buchungen);
  const p = projekteBlatt(r, buchungen);

  // Kennzahl Stundenkonto zeigt auf die Summenzeile des Kastens
  for (const zeile of bericht.blatt.zeilen) {
    for (const zelle of zeile?.zellen || []) {
      if (zelle?.f === 'H_KONTO') zelle.f = `D${bericht.kontoStand}`;
    }
  }
  bericht.blatt.bedingt.push(
    { bereich: 'E8:G8', formel: `$K$${bericht.kontoStand}<0`, stil: { schrift: { farbe: ROT } } },
    { bereich: 'E8:G8', formel: `$K$${bericht.kontoStand}>0`, stil: { schrift: { farbe: GRUEN } } },
    { bereich: 'D8', formel: `$K$${bericht.summeZeile}<0`, stil: { schrift: { farbe: ROT } } },
    { bereich: 'D8', formel: `$K$${bericht.summeZeile}>0`, stil: { schrift: { farbe: GRUEN } } },
  );

  const blaetter = [bericht.blatt, b.blatt, ...(p ? [p] : [])];
  const namen = {
    Buchung_Projekt: b.projektBereich,
    Buchung_Dauer: b.dauerBereich,
  };
  const alle = { ...namen };
  if (b.filterBereich) alle['_xlnm._FilterDatabase'] = { ziel: b.filterBereich, blatt: 1, versteckt: true };
  return { blaetter, namen: alle, kontoStandZeile: bericht.kontoStand };
}

/** Dateiname wie beim PDF: Monatsbericht 2026-11 Max Mustermann.xlsx */
export function berichtDateiname(r) {
  return `Monatsbericht ${r.jahr}-${zwei(r.monat)}${r.name ? ' ' + r.name : ''}.xlsx`.replace(/[\\/:*?"<>|]/g, '');
}
