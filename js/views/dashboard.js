/* Dashboard – die Zusammenfassung.

   Reihenfolge: Kennzahlen, Warnungen, Urlaub, Jahresuebersicht, Erklaerung.
   Die Antwort steht oben, die Herleitung darunter.

   Die wichtigste Zahl ist das Stundenkonto insgesamt: Anfangsbestand plus
   alles, was seit dem Erfassungsbeginn zusammengekommen ist. Sie steht ganz
   links, weil sie die Frage beantwortet, wegen der man die App oeffnet.
*/

import { el, leeren, num, datum } from '../util.js';
import { hinweis } from '../felder.js';
import { state } from '../store.js';
import { MONATSNAMEN, heuteISO, monatsBezeichnung } from '../kalender.js';
import {
  gesamtSaldo, jahresBilanz, monatsBilanz, urlaubsBilanz, erfassungsBeginn,
} from '../saldo.js';
import { stundenText } from '../zeit.js';
import { gewaehltesJahr, setJahr, setMonat, handyAnsicht } from '../ansicht.js';
import { darfVorgabenBearbeiten } from '../sitzung.js';
import { stempelKarte, stempelnErlaubt } from './stempelkarte.js';

export const dashboard = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    const neu = () => { leeren(container); this.render(container); };

    const daten = state.daten;
    const heute = heuteISO();
    const beginn = erfassungsBeginn(daten);

    // Die Stempeluhr steht ganz oben – auch ohne Erfassungsbeginn, gestempelt
    // werden kann immer. Am Handy hat sie mit „Heute" eine eigene Ansicht.
    if (stempelnErlaubt() && !handyAnsicht()) inner.append(stempelKarte(neu));

    if (!beginn) {
      // Wer die Vorgaben nicht bearbeiten darf, bekommt keine Einrichtungs-
      // anleitung, sondern die Lage erklärt – sonst schickt ihn das Dashboard
      // in eine Ansicht, in der für ihn alles gesperrt ist.
      inner.append(darfVorgabenBearbeiten() ? leerZustand() : leerZustandMitarbeiter());
      return;
    }

    const jahr = gewaehltesJahr();
    const konto = gesamtSaldo(daten, heute);
    const lfd = monatsBilanz(Number(heute.slice(0, 4)), Number(heute.slice(5, 7)), daten, { heute });
    const urlaub = urlaubsBilanz(Number(heute.slice(0, 4)), daten, { heute });
    const jb = jahresBilanz(jahr, daten, { heute });

    inner.append(kennzahlen(konto, lfd, urlaub, heute));
    const warnung = warnKarte(konto, jb, heute);
    if (warnung) inner.append(warnung);
    inner.append(urlaubKarte(urlaub, Number(heute.slice(0, 4))));
    inner.append(jahresKarte(jahr, jb, neu));
    inner.append(erklaerung(konto, beginn));
  },
};

/* ---------- Leerzustand ---------- */

function leerZustand() {
  const schritt = (nr, titel, text) => el('div', { style: 'display:flex;gap:14px;margin-bottom:16px;text-align:left' }, [
    el('div.badge.blau', { text: String(nr), style: 'flex:0 0 auto;height:fit-content' }),
    el('div', {}, [
      el('div', { text: titel, style: 'font-weight:600;margin-bottom:2px' }),
      el('div.hint', { text, style: 'margin:0' }),
    ]),
  ]);

  return el('div', { style: 'display:grid;gap:16px' }, [
    el('div.card', {}, [el('div.empty', {}, [
      el('div.empty-icon', { text: '🧭' }),
      el('h3', { text: 'Noch nichts erfasst' }),
      el('p', { text: 'Drei Angaben, dann rechnet das Stundenkonto von selbst weiter.' }),
    ])]),
    el('div.card', {}, [
      el('div.card-head', {}, [el('div', {}, [
        el('h2', { text: 'So richtest du es ein' }),
        el('div.sub', { text: 'alles unter „Vorgaben"' }),
      ])]),
      el('div.card-body', {}, [
        schritt(1, 'Regelarbeitszeit festlegen',
          'Wie viele Stunden an welchem Wochentag zu leisten sind. Tage mit null Stunden sind frei und '
          + 'erzeugen nie Minusstunden. Wechselt deine Arbeitszeit später, hängst du dort ein zweites '
          + 'Zeitmodell mit Stichtag an.'),
        schritt(2, 'Beginn und Anfangsbestand eintragen',
          'Ab wann gerechnet werden soll – und was du an Überstunden mitbringst. Wer im September '
          + 'anfängt und schon 50 Stunden auf dem Konto hat, trägt beides hier ein. Die Monate davor '
          + 'bleiben leer.'),
        schritt(3, 'Urlaubsanspruch und Resturlaub setzen',
          'Der Anspruch des Jahres und der Übertrag aus dem Vorjahr. Beim Einstieg mitten im Jahr ist '
          + 'der Übertrag das, was dir noch zusteht.'),
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:4px' }, [
          el('a.btn.btn-primary', { href: '#/vorgaben' }, ['Zu den Vorgaben']),
          el('a.btn.btn-ghost', { href: '#/erfassung' }, ['Direkt Zeiten erfassen']),
        ]),
      ]),
    ]),
  ]);
}

/**
 * Leerzustand für Mitarbeiter: Die Vorgaben pflegt die Verwaltung, also wäre
 * eine Einrichtungsanleitung hier ein Auftrag, den er nicht ausführen kann.
 * Stattdessen die Lage – und der Weg, der ihm offensteht: erfassen kann er
 * schon jetzt, gerechnet wird rückwirkend, sobald der Beginn gesetzt ist.
 */
function leerZustandMitarbeiter() {
  return el('div', { style: 'display:grid;gap:16px' }, [
    el('div.card', {}, [el('div.empty', {}, [
      el('div.empty-icon', { text: '🧭' }),
      el('h3', { text: 'Dein Stundenkonto ist noch nicht eingerichtet' }),
      el('p', {
        text: 'Deine Verwaltung hat den Erfassungsbeginn für dich noch nicht eingetragen. '
          + 'Bis dahin bleibt das Stundenkonto leer.',
      }),
    ])]),
    el('div.card', {}, [
      el('div.card-body', {}, [
        hinweis(
          'Du kannst deine Zeiten trotzdem schon eintragen – sie gehen nicht verloren. '
          + 'Sobald der Erfassungsbeginn gesetzt ist, zählen sie rückwirkend mit.'
        ),
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
          el('a.btn.btn-primary', { href: '#/erfassung' }, ['Zeiten erfassen']),
          el('a.btn.btn-ghost', { href: '#/vorgaben' }, ['Meine Vorgaben ansehen']),
        ]),
      ]),
    ]),
  ]);
}

/* ---------- Kennzahlen ---------- */

function kennzahlen(konto, lfd, urlaub, heute) {
  const kachel = (label, wert, sub, klasse) => el('div.kpi' + (klasse ? '.' + klasse : ''), {}, [
    el('div.kpi-label', { text: label }),
    el('div.kpi-value', { text: wert }),
    el('div.kpi-sub', { text: sub }),
  ]);

  const saldo = konto.saldoMin;
  return el('div.grid.grid-kpi', {}, [
    kachel(
      saldo < 0 ? 'Minusstunden' : 'Überstunden',
      stundenText(saldo, { vorzeichen: true }),
      `Anfangsbestand ${stundenText(konto.startMin)} · seither ${stundenText(konto.laufendMin, { vorzeichen: true })}`,
      saldo > 0 ? 'pos' : saldo < 0 ? 'neg' : ''
    ),
    kachel(
      monatsBezeichnung(Number(heute.slice(0, 4)), Number(heute.slice(5, 7))),
      stundenText(lfd.saldoMin, { vorzeichen: true }),
      `${stundenText(lfd.istMin)} von ${stundenText(lfd.sollMin)}`,
      lfd.saldoMin > 0 ? 'pos' : lfd.saldoMin < 0 ? 'neg' : ''
    ),
    kachel(
      'Urlaub übrig',
      num(urlaub.verbleibend, 1) + ' Tage',
      `von ${num(urlaub.gesamt, 1)} · ${num(urlaub.vorher + urlaub.genommen, 1)} genommen`
      + (urlaub.vorher ? ` (davon ${num(urlaub.vorher, 1)} vor Beginn)` : '')
      + `, ${num(urlaub.geplant, 1)} geplant`,
      urlaub.verbleibend < 0 ? 'neg' : ''
    ),
    kachel(
      'Nicht erfasst',
      String(konto.luecken),
      konto.luecken ? 'Arbeitstage ohne Eintrag' : 'alle Arbeitstage vollständig',
      konto.luecken ? 'neg' : ''
    ),
  ]);
}

/* ---------- Warnungen ---------- */

function warnKarte(konto, jb, heute) {
  const punkte = [];
  if (konto.luecken) {
    punkte.push([
      `${konto.luecken} Arbeitstag${konto.luecken === 1 ? '' : 'e'} ohne Eintrag`,
      'Sie gehen mit ihrem vollen Soll ins Minus. Trage die Zeiten nach – oder setze die Tagesart auf '
      + 'Urlaub, Krank oder Freizeitausgleich.',
    ]);
  }
  if (jb.warnungen) {
    punkte.push([
      `${jb.warnungen} Tage mit Beanstandung in ${jb.jahr}`,
      'Zu kurze Pause, überschneidende Abschnitte oder mehr als zehn Stunden. '
      + 'In der Erfassung stehen sie mit einem roten Zeichen.',
    ]);
  }
  if (!punkte.length) return null;

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Das solltest du ansehen' }),
        el('div.sub', { text: 'Stand ' + datum(heute) }),
      ]),
      el('a.btn.btn-sm.btn-primary', { href: '#/erfassung' }, ['Zur Erfassung']),
    ]),
    el('div.card-body', {}, punkte.map(([titel, text]) => el('div', { style: 'margin-bottom:10px' }, [
      el('div', { style: 'font-weight:600;margin-bottom:2px' }, [
        el('span.badge.gelb', { text: '!', style: 'margin-right:8px' }), titel,
      ]),
      el('div.hint', { text, style: 'margin-left:30px' }),
    ]))),
  ]);
}

/* ---------- Urlaub ---------- */

function urlaubKarte(u, jahr) {
  const gesamt = Math.max(u.gesamt, u.vorher + u.genommen + u.geplant, 1);
  const teil = (wert, farbe, titel) => wert > 0
    ? el('div.stapel-teil', { style: `width:${(wert / gesamt) * 100}%;background:${farbe}`, title: titel })
    : null;

  const zeile = (label, wert, stark) => el('div', {
    style: 'display:flex;justify-content:space-between;gap:16px;padding:4px 0;border-bottom:1px solid var(--border)',
  }, [
    el('span' + (stark ? '' : '.dim'), { text: label }),
    el('span.num', { text: num(wert, 1) + ' T', style: stark ? 'font-weight:600' : '' }),
  ]);

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: `Urlaub ${jahr}` }),
        el('div.sub', { text: u.uebertragAutomatisch ? 'Übertrag aus dem Vorjahr übernommen' : 'Übertrag von Hand gesetzt' }),
      ]),
      el('a.btn.btn-sm.btn-ghost', { href: '#/vorgaben' }, ['Anspruch ändern']),
    ]),
    el('div.card-body', {}, [
      el('div.stapel', {}, [
        teil(u.vorher, 'var(--serie-2)', `vor Erfassungsbeginn genommen: ${num(u.vorher, 1)} Tage`),
        teil(u.genommen, 'var(--serie-1)', `erfasst genommen: ${num(u.genommen, 1)} Tage`),
        teil(u.geplant, 'var(--serie-3)', `geplant: ${num(u.geplant, 1)} Tage`),
        teil(Math.max(0, u.verbleibend), 'var(--serie-5)', `frei: ${num(u.verbleibend, 1)} Tage`),
      ].filter(Boolean)),
      el('div.legende', {}, [
        u.vorher ? legende('var(--serie-2)', 'vor Erfassungsbeginn', num(u.vorher, 1)) : null,
        legende('var(--serie-1)', 'genommen', num(u.genommen, 1)),
        legende('var(--serie-3)', 'geplant', num(u.geplant, 1)),
        legende('var(--serie-5)', 'noch frei', num(Math.max(0, u.verbleibend), 1)),
      ].filter(Boolean)),
      el('div', { style: 'margin-top:16px' }, [
        zeile('Anspruch', u.anspruch),
        zeile('Übertrag aus dem Vorjahr', u.uebertrag),
        // Ohne die Fallunterscheidung zeigt Intl bei null Tagen „-0,0"
        zeile('vor Erfassungsbeginn genommen', u.vorher ? -u.vorher : 0),
        zeile('seit Erfassungsbeginn genommen', u.genommen ? -u.genommen : 0),
        zeile('geplant', u.geplant ? -u.geplant : 0),
        zeile('verbleibend', u.verbleibend, true),
      ]),
      u.verbleibend < 0
        ? hinweis('Es sind <strong>mehr Tage eingetragen, als zur Verfügung stehen</strong>. '
          + 'Prüfe den Anspruch und den Übertrag in den Vorgaben.')
        : null,
    ]),
  ]);
}

function legende(farbe, text, wert) {
  return el('div.legende-eintrag', {}, [
    el('span.legende-punkt', { style: `background:${farbe}` }),
    el('span', { text }),
    el('span.legende-wert', { text: wert + ' T' }),
  ]);
}

/* ---------- Jahresuebersicht ---------- */

function jahresKarte(jahr, jb, neu) {
  const springen = (n) => { setJahr(jahr + n); neu(); };
  const heute = heuteISO();

  const zeilen = jb.monate.map((m) => {
    const laufend = m.jahr === Number(heute.slice(0, 4)) && m.monat === Number(heute.slice(5, 7));
    return el('tr' + (laufend ? '.zeile-aktiv' : ''), {}, [
      el('td', {}, [
        el('a', {
          href: '#/erfassung', text: MONATSNAMEN[m.monat - 1],
          style: 'color:inherit',
          onclick: () => setMonat(m.jahr, m.monat),
        }),
      ]),
      el('td.num.faint', { text: m.sollMin ? stundenText(m.sollMin) : '–' }),
      el('td.num', { text: m.istMin ? stundenText(m.istMin) : '–' }),
      el('td.num' + (m.saldoMin > 0 ? '.pos' : m.saldoMin < 0 ? '.neg' : '.faint'), {
        text: m.saldoMin ? stundenText(m.saldoMin, { vorzeichen: true }) : '–',
      }),
      el('td.num' + (m.kumuliertMin > 0 ? '.pos' : m.kumuliertMin < 0 ? '.neg' : '.faint'), {
        text: stundenText(m.kumuliertMin, { vorzeichen: true }),
      }),
      el('td.num', { text: m.urlaubTage + m.urlaubGeplant ? num(m.urlaubTage + m.urlaubGeplant, 1) : '–' }),
      el('td.num', { text: m.krankTage || '–' }),
      el('td.num' + (m.luecken ? '.neg' : ''), { text: m.luecken || '–' }),
    ]);
  });

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', { style: 'display:flex;align-items:center;gap:10px' }, [
        el('button.btn.btn-sm', { type: 'button', title: 'Vorjahr', onclick: () => springen(-1) }, ['◀']),
        el('div', {}, [
          el('h2', { text: `Jahresübersicht ${jahr}` }),
          el('div.sub', { text: 'Saldo je Monat und aufgelaufen' }),
        ]),
        el('button.btn.btn-sm', { type: 'button', title: 'Folgejahr', onclick: () => springen(1) }, ['▶']),
      ]),
    ]),
    el('div', { style: 'overflow-x:auto' }, [
      // .zweispaltig: am Handy stehen die Werte einer Monatskarte nebeneinander –
      // zwoelf Karten mit je sieben Zeilen waeren sonst eine lange Rolle.
      el('table.data.kompakt.zweispaltig', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Monat' }),
          el('th', { text: 'Soll', style: 'text-align:right' }),
          el('th', { text: 'Ist', style: 'text-align:right' }),
          el('th', { text: 'Saldo', style: 'text-align:right' }),
          el('th', { text: 'aufgelaufen', style: 'text-align:right' }),
          el('th', { text: 'Urlaub', style: 'text-align:right' }),
          el('th', { text: 'Krank', style: 'text-align:right' }),
          el('th', { text: 'Lücken', style: 'text-align:right' }),
        ])]),
        el('tbody', {}, zeilen),
        el('tfoot', {}, [el('tr', {}, [
          el('td', { text: 'Jahr ' + jahr, style: 'font-weight:600' }),
          el('td.num', { text: stundenText(jb.sollMin), style: 'font-weight:600' }),
          el('td.num', { text: stundenText(jb.istMin), style: 'font-weight:600' }),
          el('td.num' + (jb.saldoMin > 0 ? '.pos' : jb.saldoMin < 0 ? '.neg' : ''), {
            text: stundenText(jb.saldoMin, { vorzeichen: true }), style: 'font-weight:600',
          }),
          el('td'),
          el('td.num', { text: num(jb.urlaubTage + jb.urlaubGeplant, 1), style: 'font-weight:600' }),
          el('td.num', { text: String(jb.krankTage), style: 'font-weight:600' }),
          el('td.num', { text: String(jb.luecken), style: 'font-weight:600' }),
        ])]),
      ]),
    ]),
  ]);
}

/* ---------- Erklaerung ---------- */

function erklaerung(konto, beginn) {
  return el('div.card', {}, [
    el('div.card-head', {}, [el('div', {}, [
      el('h2', { text: 'Wie das Konto gerechnet wird' }),
      el('div.sub', { text: `Erfassung seit ${datum(beginn)} · ${konto.tage} Tage geprüft` }),
    ])]),
    el('div.card-body', {}, [
      el('p', {
        html: 'Jeder Tag bekommt ein <strong>Soll</strong> aus dem Wochenplan, der an diesem Tag galt. '
          + 'Dem gegenüber steht das <strong>Ist</strong> – die Summe der erfassten Abschnitte abzüglich Pause. '
          + 'Die Differenz ist das Tagessaldo; alle Tagessalden zusammen plus der Anfangsbestand ergeben das Konto.',
        style: 'margin:0 0 10px;line-height:1.6',
      }),
      el('p', {
        html: '<strong>Urlaub, Krankheit und Feiertage</strong> werden mit dem Soll gutgeschrieben und ändern das Konto '
          + 'daher nicht – ein Urlaubstag bringt keine Minusstunden, aber auch keine Überstunden. '
          + '<strong>Freizeitausgleich</strong> ist die Ausnahme: dort bleibt das Soll stehen, und genau so bauen sich '
          + 'Überstunden wieder ab.',
        style: 'margin:0 0 10px;line-height:1.6',
      }),
      el('p', {
        html: 'Tage <strong>in der Zukunft zählen nicht</strong> ins Stundenkonto – ein im November eingeplanter Urlaub '
          + 'darf das heutige Saldo nicht verändern. Das Urlaubsbudget belastet er trotzdem sofort, sonst würde man '
          + 'denselben Tag zweimal verplanen.',
        style: 'margin:0;line-height:1.6',
      }),
    ]),
  ]);
}
