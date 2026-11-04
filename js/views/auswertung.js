/* Auswertung – nur fuer den Admin: gebuchte Stunden nach Projekt, Kunde und
   Mitarbeiter, fuer einen waehlbaren Zeitraum.

   Die Rechnung selbst steckt vollstaendig in projekte.js (projektAuswertung) –
   diese Ansicht holt nur die Datensaetze und Stammdaten, ruft die Funktion
   auf und zeigt das Ergebnis. Nicht zugeordnete Stunden erscheinen als
   eigene Zeile, statt kommentarlos zu fehlen.
*/

import { el, leeren, num, toast } from '../util.js';
import { hinweis } from '../felder.js';
import { heuteISO } from '../kalender.js';
import { stundenText } from '../zeit.js';
import { projektAuswertung } from '../projekte.js';
import * as api from '../api.js';

export const auswertung = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);
    const neu = () => { leeren(container); this.render(container); };

    const heute = heuteISO();
    const monatsanfang = heute.slice(0, 8) + '01';

    const platz = el('div', { text: 'Lädt …', style: 'color:var(--text-faint);font-size:13px' });
    inner.append(platz);

    Promise.all([api.uebersicht(), api.stammdaten()]).then(([{ mitarbeiter }, { stammdaten }]) => {
      leeren(inner);
      inner.append(auswertungKarte(mitarbeiter, stammdaten, monatsanfang, heute, neu));
    }).catch((e) => {
      leeren(inner);
      inner.append(el('div.startup-err', { text: 'Auswertung konnte nicht geladen werden: ' + e.message }));
    });
  },
};

function auswertungKarte(mitarbeiter, stammdaten, von, bis, neu) {
  if (!stammdaten.projekte?.length) {
    return el('div.card', {}, [
      el('div.card-body', {}, [
        el('div.empty', {}, [
          el('div.empty-icon', { text: '📊' }),
          el('h3', { text: 'Noch keine Projekte' }),
          el('p', { text: 'Lege unter „Stammdaten" Kunden und Projekte an, um Stunden auswerten zu können.' }),
        ]),
      ]),
    ]);
  }

  const vonInput = el('input', { type: 'date', value: von });
  const bisInput = el('input', { type: 'date', value: bis });

  const ergebnisBox = el('div', {});

  const kundenKarte = new Map((stammdaten.kunden || []).map((k) => [k.id, k.name]));

  const neuBerechnen = () => {
    leeren(ergebnisBox);
    const v = vonInput.value || von;
    const b = bisInput.value || bis;
    const aus = projektAuswertung(mitarbeiter, stammdaten, v, b);
    ergebnisBox.append(ergebnisAnzeige(aus, v, b, kundenKarte));
  };

  vonInput.addEventListener('change', neuBerechnen);
  bisInput.addEventListener('change', neuBerechnen);

  const karte = el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Auswertung' }),
        el('div.sub', { text: 'gebuchte Stunden im gewählten Zeitraum' }),
      ]),
      el('div', { style: 'display:flex;gap:8px;align-items:center' }, [
        vonInput, el('span', { text: '–', style: 'color:var(--text-faint)' }), bisInput,
      ]),
    ]),
    el('div.card-body', {}, [ergebnisBox]),
  ]);

  neuBerechnen();
  return karte;
}

function ergebnisAnzeige(aus, von, bis, kundenKarte) {
  const gesamtStd = aus.gesamtMinuten / 60;

  return el('div', {}, [
    hinweis(
      `Insgesamt <strong>${num(gesamtStd, 1)} h</strong> im Zeitraum ${von} – ${bis}. `
      + (aus.ohneProjektMinuten
        ? `Davon <strong>${num(aus.ohneProjektMinuten / 60, 1)} h ohne Projekt</strong> gebucht.`
        : 'Alles ist einem Projekt zugeordnet.')
    ),
    el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:10px' }, [
      el('button.btn.btn-sm', { type: 'button', onclick: () => csvExportieren(aus, von, bis, kundenKarte) }, ['Als CSV exportieren']),
    ]),
    el('div.sub', { text: 'Je Projekt', style: 'margin:4px 0 6px' }),
    projektTabelle(aus),
    el('div.sub', { text: 'Je Kunde', style: 'margin:18px 0 6px' }),
    kundeTabelle(aus),
  ]);
}

function projektTabelle(aus) {
  if (!aus.jeProjekt.length && !aus.ohneProjektMinuten) {
    return el('div.dim', { style: 'font-size:13px', text: 'Im Zeitraum wurde nichts gebucht.' });
  }
  const zeilen = aus.jeProjekt.map((p) => el('tr', {}, [
    el('td.faint', { text: p.code }),
    el('td', { text: p.name }),
    el('td.num', { text: num(p.minuten / 60, 2) }),
    el('td.faint', {
      text: p.jeMitarbeiter.map((m) => `${m.name}: ${num(m.minuten / 60, 1)} h`).join(' · '),
    }),
  ]));
  if (aus.ohneProjektMinuten) {
    zeilen.push(el('tr', {}, [
      el('td.faint', { text: '–' }),
      el('td.faint', { text: 'Ohne Projekt' }),
      el('td.num', { text: num(aus.ohneProjektMinuten / 60, 2) }),
      el('td.faint', { text: '' }),
    ]));
  }

  return el('div.plan-scroll', {}, [
    el('table.data.kompakt', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Code' }), el('th', { text: 'Projekt' }),
        el('th', { style: 'text-align:right', text: 'Stunden' }), el('th', { text: 'je Mitarbeiter' }),
      ])]),
      el('tbody', {}, zeilen),
    ]),
  ]);
}

function kundeTabelle(aus) {
  if (!aus.jeKunde.length) {
    return el('div.dim', { style: 'font-size:13px', text: 'Keine Buchungen mit Kundenbezug.' });
  }
  return el('div.plan-scroll', {}, [
    el('table.data.kompakt', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Kunde' }), el('th', { style: 'text-align:right', text: 'Stunden' }),
      ])]),
      el('tbody', {}, aus.jeKunde.map((k) => el('tr', {}, [
        el('td', { text: k.name }),
        el('td.num', { text: num(k.minuten / 60, 2) }),
      ]))),
    ]),
  ]);
}

/* ---------- CSV ---------- */

function csvZelle(wert) {
  const s = String(wert ?? '');
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvExportieren(aus, von, bis, kundenKarte) {
  const kopf = ['Projektcode', 'Projekt', 'Kunde', 'Mitarbeiter', 'Stunden'];
  const zeilen = [];
  for (const p of aus.jeProjekt) {
    const kunde = p.kundeId ? (kundenKarte.get(p.kundeId) || '') : '';
    for (const m of p.jeMitarbeiter) {
      zeilen.push([p.code, p.name, kunde, m.name, num(m.minuten / 60, 2)]);
    }
  }
  if (aus.ohneProjektMinuten) {
    zeilen.push(['', 'Ohne Projekt', '', '(alle)', num(aus.ohneProjektMinuten / 60, 2)]);
  }
  const zeilenText = zeilen.map((z) => z.map(csvZelle).join(';'));

  const csv = '﻿' + [kopf.join(';'), ...zeilenText].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `stundenkompass-auswertung-${von}-bis-${bis}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('CSV heruntergeladen', 'ok');
}
