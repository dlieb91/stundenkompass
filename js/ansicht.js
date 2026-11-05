/* Sichtzustand – welcher Ausschnitt gezeigt wird, nicht welche Zahlen es gibt.

   Der gewaehlte Monat und das gewaehlte Jahr gehoeren bewusst in den
   localStorage und nicht in die Datendatei: dass jemand gerade den Oktober
   ansieht, ist kein Merkmal seines Stundenkontos. Wer die Datei weitergibt oder
   sichert, gibt seinen Blattstand nicht mit.

   Beim ersten Start wird der laufende Monat gezeigt – das ist fast immer der,
   den man gerade nachtragen will.
*/

import { heuteISO, monatPlus } from './kalender.js';

const SCHLUESSEL_MONAT = 'stundenkompass-monat';
const SCHLUESSEL_JAHR = 'stundenkompass-jahr';

function laufenderMonat() {
  const heute = heuteISO();
  return { jahr: Number(heute.slice(0, 4)), monat: Number(heute.slice(5, 7)) };
}

export function gewaehlterMonat() {
  const roh = localStorage.getItem(SCHLUESSEL_MONAT);
  const treffer = /^(\d{4})-(\d{2})$/.exec(roh || '');
  if (!treffer) return laufenderMonat();
  return { jahr: Number(treffer[1]), monat: Number(treffer[2]) };
}

export function setMonat(jahr, monat) {
  localStorage.setItem(SCHLUESSEL_MONAT, `${jahr}-${String(monat).padStart(2, '0')}`);
}

export function monatVerschieben(n) {
  const { jahr, monat } = gewaehlterMonat();
  const neu = monatPlus(jahr, monat, n);
  setMonat(neu.jahr, neu.monat);
  return neu;
}

export function gewaehltesJahr() {
  const roh = Number(localStorage.getItem(SCHLUESSEL_JAHR));
  return Number.isFinite(roh) && roh >= 1900 && roh <= 2200 ? roh : laufenderMonat().jahr;
}

export function setJahr(jahr) {
  localStorage.setItem(SCHLUESSEL_JAHR, String(jahr));
}

/* ---------- Handyansicht ----------
   Unter 700 px Breite – ein Handy hochkant – zeigt die App eine eigene
   Anordnung: Leiste unten statt Seitenleiste, Erfassung als Tagesliste mit
   Bearbeiten-Blatt, Tabellen als Karten. Das iPad hochkant (820 px) und
   alles Breitere behaelt die gewohnte Ansicht.

   Allein mit CSS geht das nicht: Die Erfassung baut am Handy andere
   Elemente. Deshalb fragen Ansichten hier nach und main.js zeichnet neu,
   sobald sich die Breite ueber die Grenze bewegt (Handy gedreht). */

const HANDY = typeof matchMedia === 'function' ? matchMedia('(max-width: 700px)') : null;

export const handyAnsicht = () => !!HANDY?.matches;

export function beiHandyWechsel(fn) {
  HANDY?.addEventListener('change', () => fn(handyAnsicht()));
}
