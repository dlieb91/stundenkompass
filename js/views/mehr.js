/* Mehr – am Handy alles, was nicht in der Leiste unten steht.

   Welche Eintraege es gibt, entscheidet main.js (je nach Betriebsart und
   Rolle) und reicht sie herein. Diese Ansicht zeichnet nur die Liste, dazu
   Hell/Dunkel und die Versionszeile, die am PC unten in der Seitenleiste
   stehen. */

import { el } from '../util.js';

let eintraegeHolen = () => [];
let themaUmschalten = () => {};

/** main.js meldet an: () => [{ key, titel, icon }] und den Themenwechsel. */
export function mehrAnmelden(holen, thema) {
  eintraegeHolen = holen;
  themaUmschalten = thema;
}

export const mehr = {
  render(container) {
    const svg = (pfad) => el('span.mehr-icon', {
      html: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${pfad}</svg>`,
    });
    const inner = el('div.view-inner', { style: 'display:grid;gap:12px' });
    inner.append(
      el('div.card.mehr-liste', {}, eintraegeHolen().map((e) => el('a.mehr-eintrag', { href: '#/' + e.key }, [
        svg(e.icon), el('span', { text: e.titel }), e.zaehler ? el('span.nav-badge', { text: String(e.zaehler) }) : null, el('span.mehr-pfeil', { text: '›' }),
      ]))),
      el('div.card.mehr-liste', {}, [
        el('button.mehr-eintrag', { type: 'button', onclick: () => themaUmschalten() }, [
          svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
          el('span', { text: 'Hell / Dunkel' }),
        ]),
      ]),
      el('div.faint', { style: 'font-size:12px;text-align:center', text: document.getElementById('version')?.textContent || '' }),
    );
    container.append(inner);
  },
};
