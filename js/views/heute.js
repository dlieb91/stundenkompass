/* Heute – die Startansicht am Handy.

   Oben die Stempeluhr, darunter die drei Zahlen, die man unterwegs wissen
   will: Stundenkonto, laufender Monat, Resturlaub. Alles Weitere steht in
   der Uebersicht (dem Dashboard). Am PC gibt es diese Ansicht nicht – dort
   steht die Stempeluhr oben im Dashboard. */

import { el, leeren, num } from '../util.js';
import { state } from '../store.js';
import { heuteISO, monatsBezeichnung } from '../kalender.js';
import { gesamtSaldo, monatsBilanz, urlaubsBilanz, erfassungsBeginn } from '../saldo.js';
import { stundenText } from '../zeit.js';
import { darfVorgabenBearbeiten } from '../sitzung.js';
import { stempelKarte, stempelnErlaubt } from './stempelkarte.js';

export const heute = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:12px' });
    container.append(inner);
    const neu = () => { leeren(container); this.render(container); };

    const d = state.daten;
    const iso = heuteISO();
    const jahr = Number(iso.slice(0, 4));
    const monat = Number(iso.slice(5, 7));

    if (stempelnErlaubt()) inner.append(stempelKarte(neu));

    if (!erfassungsBeginn(d)) {
      inner.append(el('div.card', {}, [el('div.card-body', {}, [
        el('div', { style: 'font-weight:600;margin-bottom:4px', text: 'Noch kein Erfassungsbeginn' }),
        el('div.dim', {
          style: 'font-size:13px;margin-bottom:10px',
          text: darfVorgabenBearbeiten()
            ? 'Ohne ihn rechnet das Stundenkonto nichts. Er steht unter Mehr → Vorgaben.'
            : 'Deine Verwaltung hat ihn noch nicht eingetragen – bis dahin rechnet das Konto nichts.',
        }),
        darfVorgabenBearbeiten() ? el('a.btn', { href: '#/vorgaben' }, ['Zu den Vorgaben']) : null,
      ])]));
      return;
    }

    const konto = gesamtSaldo(d, iso);
    const lfd = monatsBilanz(jahr, monat, d, { heute: iso });
    const urlaub = urlaubsBilanz(jahr, d, { heute: iso });
    const kl = (min) => (min > 0 ? '.pos' : min < 0 ? '.neg' : '');

    inner.append(el('a.card.heute-zahlen', { href: '#/dashboard' }, [
      el('div', {}, [
        el('span', { text: 'Stundenkonto' }),
        el('b' + kl(konto.saldoMin), { text: stundenText(konto.saldoMin, { vorzeichen: true }) }),
      ]),
      el('div', {}, [
        el('span', { text: monatsBezeichnung(jahr, monat).split(' ')[0] }),
        el('b' + kl(lfd.saldoMin), { text: stundenText(lfd.saldoMin, { vorzeichen: true }) }),
      ]),
      el('div', {}, [
        el('span', { text: 'Urlaub übrig' }),
        el('b', { text: num(urlaub.verbleibend, 1) + ' T' }),
      ]),
    ]));

    if (konto.luecken) {
      inner.append(el('a.card.heute-luecken', { href: '#/erfassung' }, [
        el('span.neg', { text: `${konto.luecken} Arbeitstag${konto.luecken === 1 ? '' : 'e'} ohne Eintrag` }),
        el('span.faint', { text: 'nachtragen →' }),
      ]));
    }
  },
};
