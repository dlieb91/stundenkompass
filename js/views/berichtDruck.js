/* Monatsbericht drucken – oder als PDF sichern, das ist im Druckdialog
   jedes Browsers dieselbe Handlung („Als PDF speichern", am iPhone ueber
   Teilen → Drucken → Teilen).

   Gedruckt wird nicht die Bildschirmansicht, sondern ein eigener Bogen:
   Die Erfassung besteht aus Eingabefeldern und ist am Handy eine Liste,
   beides gehoert nicht auf ein Blatt, das man beim Arbeitgeber abgibt.
   Der Bogen wird beim Klick gebaut, liegt am Bildschirm unsichtbar im
   Dokument und verschwindet nach dem Druck wieder. css/app.css blendet
   beim Drucken alles andere aus (body.druck-bericht).

   Die Zahlen kommen aus monatsbericht.js; hier wird nur gesetzt. */

import { el, datum, num } from '../util.js';
import { state } from '../store.js';
import { heuteISO, tagePlus } from '../kalender.js';
import { stundenText } from '../zeit.js';
import { projektMit, projektpflicht } from '../stammdaten.js';
import { monatsbericht } from '../monatsbericht.js';

const h = (min, vorzeichen = false) => stundenText(min, { vorzeichen }).replace(' h', '');
const kl = (min) => (min > 0 ? '.pos' : min < 0 ? '.neg' : '');

export function berichtDrucken(jahr, monat) {
  const heute = heuteISO();
  const r = monatsbericht(state.daten, jahr, monat, {
    heute,
    projektpflicht: projektpflicht(),
    projektName: (id) => projektMit(id)?.code || projektMit(id)?.name || '?',
  });

  document.getElementById('druckbogen')?.remove();
  const bogen = bogenBauen(r, heute);
  document.body.append(bogen);
  document.body.classList.add('druck-bericht');

  // Der Titel wird im Druckdialog zum Dateinamen der PDF.
  const alterTitel = document.title;
  document.title = `Monatsbericht ${r.jahr}-${String(r.monat).padStart(2, '0')} ${r.name}`.trim();

  const aufraeumen = () => {
    document.body.classList.remove('druck-bericht');
    bogen.remove();
    document.title = alterTitel;
    window.removeEventListener('afterprint', aufraeumen);
  };
  window.addEventListener('afterprint', aufraeumen);
  // Ein Bild-Frame Zeit lassen, damit der Bogen gesetzt ist, bevor gedruckt wird.
  requestAnimationFrame(() => setTimeout(() => window.print(), 50));
}

function bogenBauen(r, heute) {
  const zeilen = r.zeilen.map((z) => {
    const mitte = z.zeiten.length ? z.zeiten.join(', ') : z.luecke ? 'nicht erfasst' : '';
    // Die Art steht nur da, wo sie etwas sagt: Urlaub, Krank, Feiertag …
    // – nicht bei jedem gewoehnlichen Arbeitstag oder Wochenende.
    const art = (z.art === 'arbeit' || z.art === 'frei') && !z.explizit ? '' : z.artText;
    const zaehltZahl = z.zaehlt && (z.sollMin || z.istMin);
    const klassen = [z.frei ? 'frei' : null, z.luecke ? 'luecke' : null, !z.zaehlt ? 'zaehltnicht' : null].filter(Boolean);
    return el('tr' + (klassen.length ? '.' + klassen.join('.') : ''), {}, [
      el('td.nowrap', { text: `${z.wochentag} ${datum(z.iso).slice(0, 6)}` }),
      el('td', { text: art }),
      el('td', { text: mitte }),
      el('td.zahl', { text: z.pauseMin ? String(z.pauseMin) : '' }),
      el('td.zahl', { text: z.istMin ? h(z.istMin) : '' }),
      el('td.zahl', { text: z.sollMin ? h(z.sollMin) : '' }),
      el('td.zahl' + (zaehltZahl ? kl(z.saldoMin) : ''), { text: zaehltZahl && (z.istMin || z.saldoMin) ? h(z.saldoMin, true) : '' }),
      el('td.klein', { text: [z.projekte.join(', '), z.notiz].filter(Boolean).join(' · ') }),
    ]);
  });

  const kasten = (titel, reihen) => el('div.db-kasten', {}, [
    el('div.db-kasten-titel', { text: titel }),
    ...reihen.map(([l, w, k]) => el('div.db-reihe' + (k || ''), {}, [el('span', { text: l }), el('span', { text: w })])),
  ]);

  const k = r.konto;
  const u = r.urlaub;
  return el('div', { id: 'druckbogen' }, [
    el('div.db-kopf', {}, [
      el('div', {}, [
        el('div.db-marke', { html: '<svg width="24" height="24" aria-hidden="true"><use href="#zkKompass" width="24" height="24"/></svg><span>StundenKompass</span>' }),
        el('h1', { text: 'Monatsbericht Arbeitszeit' }),
        el('div.db-monat', { text: r.titel }),
      ]),
      el('div.db-person', {}, [
        el('div', { text: r.name }),
        r.zeitmodell ? el('div.klein', { text: r.zeitmodell }) : null,
        el('div.klein', { text: `Zeitraum ${datum(r.erster)} – ${datum(r.letzter)}` }),
      ]),
    ]),
    r.laufend && !r.zukunft
      ? el('div.db-hinweis', { text: `Stand ${datum(r.stichtag)}: Der Monat ist noch nicht abgeschlossen. Tage nach dem ${datum(r.stichtag)} zählen noch nicht.` })
      : null,
    el('table.db-tabelle', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Tag' }), el('th', { text: 'Art' }), el('th', { text: 'Arbeitszeit' }),
        el('th.zahl', { text: 'Pause' }), el('th.zahl', { text: 'Ist' }), el('th.zahl', { text: 'Soll' }),
        el('th.zahl', { text: 'Saldo' }), el('th', { text: 'Projekt / Notiz' }),
      ])]),
      el('tbody', {}, zeilen),
      el('tfoot', {}, [el('tr', {}, [
        el('td', { text: 'Summe', colspan: 4 }),
        el('td.zahl', { text: h(r.summen.istMin) }),
        el('td.zahl', { text: h(r.summen.sollMin) }),
        el('td.zahl' + kl(r.summen.saldoMin), { text: h(r.summen.saldoMin, true) }),
        el('td'),
      ])]),
    ]),
    el('div.db-kaesten', {}, [
      kasten('Stundenkonto', [
        [k.vorherIstAnfangsbestand ? 'Anfangsbestand' : `Stand ${datum(tagePlus(r.erster, -1))}`, stundenText(k.vorherMin, { vorzeichen: true })],
        [`Saldo ${r.titel}`, stundenText(k.monatMin, { vorzeichen: true })],
        [`Stand ${datum(r.zukunft ? r.erster : r.stichtag)}`, stundenText(k.nachherMin, { vorzeichen: true }), '.db-summe'],
      ]),
      kasten(`Urlaub ${u.jahr}`, [
        ['Anspruch inkl. Übertrag', num(u.gesamt, 1) + ' Tage'],
        ...(u.vorher ? [['vor Erfassungsbeginn genommen', num(u.vorher, 1) + ' Tage']] : []),
        [`genommen bis ${datum(r.stichtag)}`, num(u.genommen, 1) + ' Tage'],
        ...(u.geplant ? [['danach geplant', num(u.geplant, 1) + ' Tage']] : []),
        ['verbleibend', num(u.verbleibend, 1) + ' Tage', '.db-summe'],
      ]),
      kasten('Im Monat', [
        ['Urlaubstage', num(r.summen.urlaubTage, 1)],
        ['Krankheitstage', String(r.summen.krankTage)],
        ['nicht erfasste Arbeitstage', String(r.summen.luecken)],
      ]),
    ]),
    r.beanstandungen.length
      ? el('div.db-beanstandungen', {}, [
        el('div.db-kasten-titel', { text: 'Hinweise zu einzelnen Tagen' }),
        ...r.beanstandungen.map((b) => el('div', { text: `${datum(b.iso)}: ${b.texte.join(' ')}` })),
      ])
      : null,
    el('div.db-unterschriften', {}, [
      el('div', {}, [el('div.db-linie'), el('div.klein', { text: 'Datum, Unterschrift Mitarbeiter/in' })]),
      el('div', {}, [el('div.db-linie'), el('div.klein', { text: 'Datum, Unterschrift Arbeitgeber' })]),
    ]),
    el('div.db-fuss', {
      text: `Erstellt am ${datum(heute)} mit StundenKompass. Ist = Arbeitszeit abzüglich Pause; `
        + 'Pause = Lücken zwischen den Abschnitten plus eingetragene Pause. Urlaub, Krankheit und Feiertage '
        + 'werden mit dem Soll gutgeschrieben.',
    }),
  ]);
}
