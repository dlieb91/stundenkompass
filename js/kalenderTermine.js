/* Kalendertermine – was der Kalender an einem Tag zeichnet.

   Rein rechnend, ohne DOM: aus dem erfassten Tag werden Bloecke auf der
   Zeitachse (Minuten ab Mitternacht) und Ganztagszeilen.

     arbeit   jeder erfasste Abschnitt mit Beginn und Ende, so wie er
              eingetragen ist. Die Luecken zwischen Abschnitten bleiben
              leer – man sieht, wann gearbeitet wurde und wann nicht.
     krank,   ohne eigene Zeiten die Vorgabezeiten des geltenden Zeitmodells
     urlaub   (z. B. 08:00–17:00), mit der Vorgabepause als eigenem Block.
              Die Pause liegt ab 12:00, wenn sie dort hineinpasst, sonst in
              der Mitte – die Vorgabe kennt nur ihre Dauer, nicht ihre Lage.
              Nur an Tagen mit Arbeitspflicht: Urlaub am Samstag zeichnet
              nichts, er kostet ja auch keinen Urlaubstag.
     halber   die halbe Sollzeit als Urlaubsblock, vor oder nach dem, was
     Urlaub   gearbeitet wurde.

   Feiertag, Frei, Freizeitausgleich und Arbeitstage ohne Eintrag stehen
   als Ganztagszeile oben, nicht auf der Zeitachse.

   Ein Abschnitt ueber Mitternacht (22:00–06:00) wird geteilt: bis 24:00 am
   eigenen Tag, der Rest ab 0:00 am Folgetag. Ein laufender Abschnitt
   (eingestempelt, noch kein Ende) reicht bis jetzt. */

import { tagesBilanz, feiertagsKarte } from './saldo.js';
import { zuMinuten, TAG_MINUTEN } from './zeit.js';
import { jahrVon, tagePlus } from './kalender.js';

export const MITTAG_MIN = 12 * 60;

/** Lage der Vorgabepause innerhalb von [von, bis]. */
export function pausenLage(von, bis, pauseMin) {
  if (!pauseMin || pauseMin <= 0 || bis - von <= pauseMin) return null;
  if (von <= MITTAG_MIN && MITTAG_MIN + pauseMin <= bis) return { von: MITTAG_MIN, bis: MITTAG_MIN + pauseMin };
  const start = Math.round((von + bis - pauseMin) / 2);
  return { von: start, bis: start + pauseMin };
}

/** Vorgabezeiten eines Tages als Bloecke: Abwesenheit, Pause, Abwesenheit. */
function vorgabeBloecke(art, plan) {
  const von = zuMinuten(plan?.vorgabeVon);
  let bis = zuMinuten(plan?.vorgabeBis);
  if (von == null || bis == null) return [];
  if (bis <= von) bis += TAG_MINUTEN;
  bis = Math.min(bis, TAG_MINUTEN);
  const p = pausenLage(von, bis, plan.vorgabePauseMin);
  if (!p) return [{ art, von, bis, vorgabe: true }];
  return [
    { art, von, bis: p.von, vorgabe: true },
    { art: 'pause', von: p.von, bis: p.bis, vorgabe: true },
    { art, von: p.bis, bis, vorgabe: true },
  ];
}

/** Erfasste Abschnitte eines Eintrags; uebernacht liefert den Teil nach 0:00. */
function abschnitte(eintrag, { laeuft, jetztMin, uebernacht = false }) {
  const ivs = eintrag?.intervalle || [];
  const aus = [];
  ivs.forEach((iv, i) => {
    const von = zuMinuten(iv?.von);
    let bis = zuMinuten(iv?.bis);
    const offen = laeuft && i === ivs.length - 1 && von != null && bis == null;
    if (von == null || (bis == null && !offen)) return;
    if (uebernacht) {
      if (!offen && bis < von && bis > 0) aus.push({ von: 0, bis, index: i, projektId: iv.projektId || null });
      return;
    }
    if (offen) {
      bis = jetztMin == null ? von : Math.max(von, jetztMin < von ? TAG_MINUTEN : jetztMin);
    } else if (bis <= von) {
      bis = TAG_MINUTEN;
    }
    if (bis > von || offen) aus.push({ von, bis, index: i, projektId: iv.projektId || null, laeuft: offen });
  });
  return aus;
}

/** Ueberlappende Bloecke nebeneinander legen: spur und spuren je Block. */
export function spurenVerteilen(bloecke) {
  const sortiert = [...bloecke].sort((a, b) => a.von - b.von || b.bis - a.bis);
  let gruppe = [];
  let gruppeEnde = -1;
  const abschliessen = () => {
    const n = gruppe.reduce((m, b) => Math.max(m, b.spur + 1), 1);
    for (const b of gruppe) b.spuren = n;
    gruppe = [];
  };
  for (const b of sortiert) {
    if (b.von >= gruppeEnde && gruppe.length) abschliessen();
    const belegt = gruppe.filter((g) => g.bis > b.von).map((g) => g.spur);
    let spur = 0;
    while (belegt.includes(spur)) spur++;
    b.spur = spur;
    gruppe.push(b);
    gruppeEnde = Math.max(gruppeEnde, b.bis);
  }
  if (gruppe.length) abschliessen();
  return sortiert;
}

/**
 * Termine eines Tages.
 * opt.heute     ISO des heutigen Tages
 * opt.jetztMin  Minuten seit Mitternacht (fuer den laufenden Abschnitt)
 * Liefert { iso, art, feiertagName, ganztags: [{art, text}], bloecke: [...] }
 */
export function tagesTermine(iso, daten, { heute, jetztMin = null } = {}) {
  const ktx = { heute, feiertage: feiertagsKarte(jahrVon(iso), daten) };
  const b = tagesBilanz(iso, daten, ktx);
  const eintrag = daten?.tage?.[iso] || null;
  const ganztags = [];
  const bloecke = [];

  // Fortsetzung eines Abschnitts vom Vortag ueber Mitternacht
  const vortag = daten?.tage?.[tagePlus(iso, -1)];
  for (const a of abschnitte(vortag, { uebernacht: true })) bloecke.push({ art: 'arbeit', ...a, vomVortag: true });

  const eigene = abschnitte(eintrag, { laeuft: b.laeuft && iso === heute, jetztMin });
  const pflicht = b.sollMin > 0 && !b.feiertagName;

  if (b.art === 'krank' || b.art === 'urlaub') {
    if (eigene.length) bloecke.push(...eigene.map((a) => ({ art: b.art, ...a })));
    else if (pflicht) bloecke.push(...vorgabeBloecke(b.art, b.plan));
    else ganztags.push({ art: b.art, text: b.artInfo.text });
  } else if (b.art === 'urlaubHalb') {
    bloecke.push(...eigene.map((a) => ({ art: 'arbeit', ...a })));
    const von = zuMinuten(b.plan?.vorgabeVon);
    const bis = zuMinuten(b.plan?.vorgabeBis);
    const dauer = Math.round(b.sollMin / 2);
    if (pflicht && von != null && bis != null && dauer > 0) {
      // Vormittags frei, wenn erst ab Mittag gearbeitet wurde (oder gar nicht)
      const nachmittagsGearbeitet = !eigene.length || eigene[0].von >= MITTAG_MIN;
      const start = nachmittagsGearbeitet ? von : Math.max(von, bis - dauer);
      bloecke.push({ art: 'urlaub', von: start, bis: Math.min(TAG_MINUTEN, start + dauer), vorgabe: true, halb: true });
    } else {
      ganztags.push({ art: 'urlaub', text: b.artInfo.text });
    }
  } else {
    bloecke.push(...eigene.map((a) => ({ art: 'arbeit', ...a })));
    if (b.art === 'feiertag') ganztags.push({ art: 'feiertag', text: b.feiertagName || 'Feiertag' });
    else if (b.art === 'ausgleich') ganztags.push({ art: 'ausgleich', text: 'Freizeitausgleich' });
    else if (b.art === 'frei' && eintrag?.art === 'frei') ganztags.push({ art: 'frei', text: 'Frei' });
    if (b.luecke) ganztags.push({ art: 'luecke', text: 'nicht erfasst' });
  }

  return {
    iso,
    art: b.art,
    feiertagName: b.feiertagName,
    istMin: b.istMin,
    pauseMin: eintrag?.pauseMin || 0,
    notiz: eintrag?.notiz || '',
    ganztags,
    bloecke: spurenVerteilen(bloecke),
  };
}

/** Sichtbarer Stundenbereich fuer mehrere Tage: mindestens 7–19 Uhr. */
export function stundenBereich(tageTermine, { von = 7, bis = 19 } = {}) {
  let a = von * 60;
  let e = bis * 60;
  for (const t of tageTermine) {
    for (const b of t.bloecke) { a = Math.min(a, b.von); e = Math.max(e, b.bis); }
  }
  return { vonStunde: Math.floor(a / 60), bisStunde: Math.min(24, Math.ceil(e / 60)) };
}
