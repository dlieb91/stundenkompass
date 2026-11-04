/* Stammdaten – nur fuer den Admin: Kunden und Projekte, auf die Mitarbeiter
   ihre Zeiten buchen koennen.

   projektpflicht schaltet die ganze Funktion frei. Aus (Standard): keine
   Projektspalte in der Erfassung, keine Beanstandung – ein Betrieb ohne
   Projekte merkt von alldem nichts.

   Archiviert wird, nicht geloescht, wie schon bei den Konten. Ein Kunde
   mit noch aktiven Projekten laesst sich nicht archivieren; der Server
   nennt dann die betroffenen Projekte.
*/

import { el, leeren, toast, bestaetigen, modal } from '../util.js';
import { hinweis, abschnitt } from '../felder.js';
import * as api from '../api.js';
import { stammdatenLaden } from '../stammdaten.js';

export const stammdaten = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);
    const neu = () => { leeren(container); this.render(container); };

    const platz = el('div', { text: 'Lädt …', style: 'color:var(--text-faint);font-size:13px' });
    inner.append(platz);

    stammdatenLaden().then((daten) => {
      leeren(inner);
      inner.append(pflichtKarte(daten, neu));
      inner.append(kundenKarte(daten, neu));
      inner.append(projekteKarte(daten, neu));
    }).catch((e) => {
      leeren(inner);
      inner.append(el('div.startup-err', { text: 'Stammdaten konnten nicht geladen werden: ' + e.message }));
    });
  },
};

/* ---------- Projektpflicht ---------- */

function pflichtKarte(daten, neu) {
  const schalter = el('input', {
    type: 'checkbox', checked: !!daten.projektpflicht, style: 'width:auto;margin-right:9px',
    onchange: async (e) => {
      const an = e.target.checked;
      try {
        await api.projektpflichtSetzen(an);
        toast(an ? 'Projektpflicht eingeschaltet' : 'Projektpflicht ausgeschaltet', 'ok');
        neu();
      } catch (err) {
        e.target.checked = !an;
        toast('Fehlgeschlagen: ' + err.message, 'err', 6000);
      }
    },
  });

  return abschnitt('Projektbuchung', 'gilt für den ganzen Betrieb', [
    el('div', {}, [
      el('label', { style: 'display:flex;align-items:center;cursor:pointer;color:var(--text)' }, [
        schalter, 'Projekt bei jedem Arbeitsabschnitt verlangen',
      ]),
      el('div.hint', {
        style: 'margin-left:24px;margin-top:4px',
        text: 'Ausgeschaltet: keine Projektspalte in der Erfassung, keine Beanstandung. '
          + 'Eingeschaltet: ein Abschnitt ohne Projekt bekommt das rote Zeichen am Zeilenende – '
          + 'wie eine zu kurze Pause. Nichts wird blockiert.',
      }),
    ]),
  ]);
}

/* ---------- Kunden ---------- */

function kundenKarte(daten, neu) {
  const nummer = el('input', { type: 'text', placeholder: 'Kundennummer (optional)' });
  const name = el('input', { type: 'text', placeholder: 'Firma oder Name' });
  const notiz = el('input', { type: 'text', placeholder: 'Notiz (optional)' });
  const fehlerBox = el('div.startup-err', { style: 'display:none;margin-top:10px' });

  const anlegen = async () => {
    fehlerBox.style.display = 'none';
    if (!name.value.trim()) {
      fehlerBox.textContent = 'Name ist erforderlich.';
      fehlerBox.style.display = '';
      return;
    }
    try {
      await api.kundeAnlegen({ nummer: nummer.value.trim(), name: name.value.trim(), notiz: notiz.value.trim() });
      toast('Kunde angelegt', 'ok');
      neu();
    } catch (e) {
      fehlerBox.textContent = e.message;
      fehlerBox.style.display = '';
    }
  };

  const liste = daten.kunden || [];

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Kunden' }),
        el('div.sub', { text: `${liste.length} insgesamt, ${liste.filter((k) => k.aktiv).length} aktiv` }),
      ]),
    ]),
    el('div.card-body', {}, [
      el('div', { style: 'display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:14px' }, [
        el('div.field', {}, [el('label', { text: 'Nummer' }), nummer]),
        el('div.field', {}, [el('label', { text: 'Name' }), name]),
        el('div.field', {}, [el('label', { text: 'Notiz' }), notiz]),
      ]),
      fehlerBox,
      el('div', { style: 'margin-bottom:16px' }, [
        el('button.btn.btn-primary.btn-sm', { type: 'button', onclick: anlegen }, ['Kunde anlegen']),
      ]),
      liste.length
        ? el('div.plan-scroll', {}, [
          el('table.data.kompakt', {}, [
            el('thead', {}, [el('tr', {}, [
              el('th', { text: 'Nummer' }), el('th', { text: 'Name' }), el('th', { text: 'Notiz' }),
              el('th', { text: 'Status' }), el('th', { text: '' }),
            ])]),
            el('tbody', {}, liste.map((k) => kundeZeile(k, neu))),
          ]),
        ])
        : el('div.dim', { style: 'font-size:13px', text: 'Noch kein Kunde angelegt.' }),
    ]),
  ]);
}

function kundeZeile(k, neu) {
  return el('tr', {}, [
    el('td.faint', { text: k.nummer || '–' }),
    el('td', { text: k.name }),
    el('td.faint', { text: k.notiz || '–' }),
    el('td', {}, [
      k.aktiv ? el('span.badge.blau', { text: 'aktiv' }) : el('span.badge.grau', { text: 'archiviert' }),
    ]),
    el('td', { style: 'text-align:right;white-space:nowrap' }, [
      el('button.btn.btn-sm', { type: 'button', onclick: () => kundeBearbeitenDialog(k, neu) }, ['Bearbeiten']),
      el('button.btn.btn-sm' + (k.aktiv ? '.btn-danger' : ''), {
        type: 'button', style: 'margin-left:6px',
        onclick: () => kundeAktivUmschalten(k, neu),
      }, [k.aktiv ? 'Archivieren' : 'Aktivieren']),
    ]),
  ]);
}

function kundeBearbeitenDialog(k, neu) {
  const nummer = el('input', { type: 'text', value: k.nummer || '' });
  const name = el('input', { type: 'text', value: k.name });
  const notiz = el('input', { type: 'text', value: k.notiz || '' });

  modal({
    titel: 'Kunde bearbeiten',
    inhalt: el('div', { style: 'display:grid;gap:10px' }, [
      el('div.field', {}, [el('label', { text: 'Nummer' }), nummer]),
      el('div.field', {}, [el('label', { text: 'Name' }), name]),
      el('div.field', {}, [el('label', { text: 'Notiz' }), notiz]),
    ]),
    buttons: [
      { text: 'Abbrechen', wert: null },
      { text: 'Speichern', klasse: 'btn-primary', wert: '\0', vorAbschluss: () => !!name.value.trim() },
    ],
  }).then(async (v) => {
    if (v !== '\0') return;
    try {
      await api.kundeAendern(k.id, { nummer: nummer.value.trim(), name: name.value.trim(), notiz: notiz.value.trim() });
      toast('Gespeichert', 'ok');
      neu();
    } catch (e) {
      toast('Fehlgeschlagen: ' + e.message, 'err', 6000);
    }
  });
}

async function kundeAktivUmschalten(k, neu) {
  if (k.aktiv) {
    const ok = await bestaetigen('Kunde archivieren',
      `„${k.name}" taucht danach in keiner Auswahl mehr auf. Solange noch aktive Projekte auf ihn zeigen, lehnt der Server das ab.`,
      { okText: 'Archivieren', gefahr: true });
    if (!ok) return;
  }
  try {
    await api.kundeAktivSetzen(k.id, !k.aktiv);
    toast(k.aktiv ? 'Archiviert' : 'Aktiviert', 'ok');
    neu();
  } catch (e) {
    toast('Fehlgeschlagen: ' + e.message, 'err', 6000);
  }
}

/* ---------- Projekte ---------- */

function projekteKarte(daten, neu) {
  const kunden = daten.kunden || [];
  const code = el('input', { type: 'text', placeholder: 'z. B. P-2026-014' });
  const name = el('input', { type: 'text', placeholder: 'Projektname' });
  const kunde = el('select', {}, [
    el('option', { value: '', text: '– kein Kunde –' }),
    ...kunden.filter((k) => k.aktiv).map((k) => el('option', { value: k.id, text: k.name })),
  ]);
  const details = el('input', { type: 'text', placeholder: 'Details (optional)' });
  const fehlerBox = el('div.startup-err', { style: 'display:none;margin-top:10px' });

  const anlegen = async () => {
    fehlerBox.style.display = 'none';
    if (!code.value.trim() || !name.value.trim()) {
      fehlerBox.textContent = 'Projektcode und Name sind erforderlich.';
      fehlerBox.style.display = '';
      return;
    }
    try {
      await api.projektAnlegen({
        code: code.value.trim(), name: name.value.trim(),
        kundeId: kunde.value || null, details: details.value.trim(),
      });
      toast('Projekt angelegt', 'ok');
      neu();
    } catch (e) {
      fehlerBox.textContent = e.message;
      fehlerBox.style.display = '';
    }
  };

  const liste = daten.projekte || [];
  const kundenKarteById = new Map(kunden.map((k) => [k.id, k]));

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Projekte' }),
        el('div.sub', { text: `${liste.length} insgesamt, ${liste.filter((p) => p.aktiv).length} aktiv` }),
      ]),
    ]),
    el('div.card-body', {}, [
      el('div', { style: 'display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:14px' }, [
        el('div.field', {}, [el('label', { text: 'Projektcode' }), code]),
        el('div.field', {}, [el('label', { text: 'Name' }), name]),
        el('div.field', {}, [el('label', { text: 'Kunde' }), kunde]),
        el('div.field', {}, [el('label', { text: 'Details' }), details]),
      ]),
      fehlerBox,
      el('div', { style: 'margin-bottom:16px' }, [
        el('button.btn.btn-primary.btn-sm', { type: 'button', onclick: anlegen }, ['Projekt anlegen']),
      ]),
      liste.length
        ? el('div.plan-scroll', {}, [
          el('table.data.kompakt', {}, [
            el('thead', {}, [el('tr', {}, [
              el('th', { text: 'Code' }), el('th', { text: 'Name' }), el('th', { text: 'Kunde' }),
              el('th', { text: 'Status' }), el('th', { text: '' }),
            ])]),
            el('tbody', {}, liste.map((p) => projektZeile(p, kunden, kundenKarteById, neu))),
          ]),
        ])
        : el('div.dim', { style: 'font-size:13px', text: 'Noch kein Projekt angelegt.' }),
    ]),
  ]);
}

function projektZeile(p, kunden, kundenKarteById, neu) {
  return el('tr', {}, [
    el('td.faint', { text: p.code }),
    el('td', { text: p.name }),
    el('td.faint', { text: p.kundeId ? (kundenKarteById.get(p.kundeId)?.name || '–') : '–' }),
    el('td', {}, [
      p.aktiv ? el('span.badge.blau', { text: 'aktiv' }) : el('span.badge.grau', { text: 'archiviert' }),
    ]),
    el('td', { style: 'text-align:right;white-space:nowrap' }, [
      el('button.btn.btn-sm', { type: 'button', onclick: () => projektBearbeitenDialog(p, kunden, neu) }, ['Bearbeiten']),
      el('button.btn.btn-sm' + (p.aktiv ? '.btn-danger' : ''), {
        type: 'button', style: 'margin-left:6px',
        onclick: () => projektAktivUmschalten(p, neu),
      }, [p.aktiv ? 'Archivieren' : 'Aktivieren']),
    ]),
  ]);
}

function projektBearbeitenDialog(p, kunden, neu) {
  const code = el('input', { type: 'text', value: p.code });
  const name = el('input', { type: 'text', value: p.name });
  const kunde = el('select', {}, [
    el('option', { value: '', text: '– kein Kunde –', selected: !p.kundeId }),
    ...kunden.map((k) => el('option', { value: k.id, text: k.name, selected: k.id === p.kundeId })),
  ]);
  const details = el('input', { type: 'text', value: p.details || '' });

  modal({
    titel: 'Projekt bearbeiten',
    inhalt: el('div', { style: 'display:grid;gap:10px' }, [
      el('div.field', {}, [el('label', { text: 'Projektcode' }), code]),
      el('div.field', {}, [el('label', { text: 'Name' }), name]),
      el('div.field', {}, [el('label', { text: 'Kunde' }), kunde]),
      el('div.field', {}, [el('label', { text: 'Details' }), details]),
    ]),
    buttons: [
      { text: 'Abbrechen', wert: null },
      {
        text: 'Speichern', klasse: 'btn-primary', wert: '\0',
        vorAbschluss: () => !!code.value.trim() && !!name.value.trim(),
      },
    ],
  }).then(async (v) => {
    if (v !== '\0') return;
    try {
      await api.projektAendern(p.id, {
        code: code.value.trim(), name: name.value.trim(),
        kundeId: kunde.value || null, details: details.value.trim(),
      });
      toast('Gespeichert', 'ok');
      neu();
    } catch (e) {
      toast('Fehlgeschlagen: ' + e.message, 'err', 6000);
    }
  });
}

async function projektAktivUmschalten(p, neu) {
  if (p.aktiv) {
    const ok = await bestaetigen('Projekt archivieren',
      `„${p.code} – ${p.name}" taucht danach in keiner Auswahl mehr auf. Bereits gebuchte Zeiten bleiben erhalten und zählen weiter in der Auswertung.`,
      { okText: 'Archivieren', gefahr: true });
    if (!ok) return;
  }
  try {
    await api.projektAktivSetzen(p.id, !p.aktiv);
    toast(p.aktiv ? 'Archiviert' : 'Aktiviert', 'ok');
    neu();
  } catch (e) {
    toast('Fehlgeschlagen: ' + e.message, 'err', 6000);
  }
}
