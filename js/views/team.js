/* Team – nur fuer den Admin: alle Mitarbeiter nebeneinander.

   Zeile je Konto mit Stundenkonto, Saldo des laufenden Monats, Resturlaub
   und nicht erfassten Tagen – dieselben vier Zahlen, die auch das Dashboard
   fuer eine einzelne Person zeigt. Es steckt keine neue Rechnung dahinter:
   gesamtSaldo(), monatsBilanz() und urlaubsBilanz() aus saldo.js werden nur
   je Datensatz einmal aufgerufen. Ein Klick auf eine Zeile schaltet den
   Mitarbeiter-Umschalter in der Kopfzeile um.

   Der CSV-Export exportiert genau diese Tabelle – fuer die Lohnbuchhaltung
   reicht eine Momentaufnahme, keine eigene Datenaufbereitung.
*/

import { el, leeren, num, toast } from '../util.js';
import { hinweis } from '../felder.js';
import { heuteISO } from '../kalender.js';
import { gesamtSaldo, monatsBilanz, urlaubsBilanz, erfassungsBeginn } from '../saldo.js';
import { stundenText } from '../zeit.js';
import * as api from '../api.js';
import { betrachtenSetzen } from '../sitzung.js';

export const team = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);
    const platz = el('div', { text: 'Lädt …', style: 'color:var(--text-faint);font-size:13px' });
    inner.append(platz);

    api.uebersicht().then(({ mitarbeiter }) => {
      leeren(inner);
      inner.append(tabelle(mitarbeiter));
    }).catch((e) => {
      leeren(inner);
      inner.append(el('div.startup-err', { text: 'Team konnte nicht geladen werden: ' + e.message }));
    });
  },
};

function tabelle(mitarbeiter) {
  const heute = heuteISO();
  const jahr = Number(heute.slice(0, 4));
  const monat = Number(heute.slice(5, 7));

  const zeilen = mitarbeiter.map(({ konto, daten }) => {
    if (!daten || !erfassungsBeginn(daten)) {
      return { konto, ohneDaten: true };
    }
    const gesamt = gesamtSaldo(daten, heute);
    const lfd = monatsBilanz(jahr, monat, daten, { heute });
    const urlaub = urlaubsBilanz(jahr, daten, { heute });
    return { konto, gesamt, lfd, urlaub };
  });

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Team' }),
        el('div.sub', { text: `${mitarbeiter.length} aktive Konten` }),
      ]),
      el('button.btn.btn-sm', { type: 'button', onclick: () => csvExportieren(zeilen) }, ['Als CSV exportieren']),
    ]),
    el('div.plan-scroll', {}, [
      el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Name' }),
          el('th', { text: 'Rolle' }),
          el('th', { style: 'text-align:right', text: 'Stundenkonto' }),
          el('th', { style: 'text-align:right', text: 'Saldo Monat' }),
          el('th', { style: 'text-align:right', text: 'Resturlaub' }),
          el('th', { style: 'text-align:right', text: 'Lücken' }),
          el('th', { text: '' }),
        ])]),
        el('tbody', {}, zeilen.map(zeile)),
      ]),
    ]),
    hinweis(
      'Ein Klick auf eine Zeile öffnet die Daten dieser Person über den Umschalter oben in der Kopfzeile. '
      + 'Änderungen dort werden protokolliert und sind für die betroffene Person sichtbar.'
    ),
  ]);
}

function zeile(z) {
  const oeffnen = () => {
    betrachtenSetzen(z.konto.id);
    location.hash = '#/dashboard';
  };

  if (z.ohneDaten) {
    // Ohne Erfassungsbeginn rechnet dieses Konto nichts – und der Mitarbeiter
    // kann es nicht selbst nachholen. Deshalb hier deutlich sichtbar samt
    // Abkuerzung in seine Vorgaben, statt als beilaeufige Textzeile.
    const einrichten = () => {
      betrachtenSetzen(z.konto.id);
      location.hash = '#/vorgaben';
    };
    return el('tr', {}, [
      el('td', {}, [el('a', { href: '#/dashboard', text: z.konto.name, onclick: (e) => { e.preventDefault(); oeffnen(); } })]),
      el('td.faint', { text: z.konto.rolle === 'admin' ? 'Verwaltung' : 'Mitarbeiter' }),
      el('td', { colSpan: 4 }, [
        el('span.badge.gelb', { text: 'Kein Erfassungsbeginn – zählt nicht' }),
      ]),
      el('td', { style: 'text-align:right' }, [
        el('button.btn.btn-sm.btn-primary', { type: 'button', onclick: einrichten }, ['Einrichten']),
      ]),
    ]);
  }

  return el('tr', {}, [
    el('td', {}, [el('a', { href: '#/dashboard', text: z.konto.name, onclick: (e) => { e.preventDefault(); oeffnen(); } })]),
    el('td.faint', { text: z.konto.rolle === 'admin' ? 'Verwaltung' : 'Mitarbeiter' }),
    el('td.num' + (z.gesamt.saldoMin < 0 ? '.neg' : ''), { text: stundenText(z.gesamt.saldoMin, { vorzeichen: true }) }),
    el('td.num' + (z.lfd.saldoMin < 0 ? '.neg' : ''), { text: stundenText(z.lfd.saldoMin, { vorzeichen: true }) }),
    el('td.num', { text: num(z.urlaub.verbleibend, 1) + ' Tage' }),
    el('td.num', { text: z.gesamt.luecken > 0 ? String(z.gesamt.luecken) : '–' }),
    el('td', { style: 'text-align:right' }, [
      el('button.btn.btn-sm', { type: 'button', onclick: oeffnen }, ['Öffnen']),
    ]),
  ]);
}

function csvZelle(wert) {
  const s = String(wert ?? '');
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvExportieren(zeilen) {
  const kopf = ['Name', 'Rolle', 'Stundenkonto (h)', 'Saldo Monat (h)', 'Resturlaub (Tage)', 'Lücken'];
  const zeilenText = zeilen.map((z) => [
    z.konto.name,
    z.konto.rolle === 'admin' ? 'Verwaltung' : 'Mitarbeiter',
    z.ohneDaten ? '' : num(z.gesamt.saldoMin / 60, 2),
    z.ohneDaten ? '' : num(z.lfd.saldoMin / 60, 2),
    z.ohneDaten ? '' : num(z.urlaub.verbleibend, 1),
    z.ohneDaten ? '' : z.gesamt.luecken,
  ].map(csvZelle).join(';'));

  const csv = '﻿' + [kopf.join(';'), ...zeilenText].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `stundenkompass-team-${heuteISO()}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('CSV heruntergeladen', 'ok');
}
