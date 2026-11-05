/* Service Worker – nur im Einzelplatzbetrieb angemeldet (siehe main.js).
   Haelt die Programmdateien vor, damit die App ohne Netz startet. **Nur
   Programmdateien** – die Zeitdaten liegen in IndexedDB oder im Ordner und
   gehoeren hier nicht hinein.

   Strategie: zuerst das Netz, bei Erfolg die Antwort in den
   Zwischenspeicher legen, bei Fehlschlag von dort bedienen. So laeuft man
   nie einer alten Fassung hinterher, solange Netz da ist, und hat trotzdem
   immer eine vollstaendige Huelle.

   Durchgereicht und nie zwischengespeichert werden:
     - fremde Server, Dropbox allen voran – ein fehlgeschlagener Abgleich
       soll als Fehler ankommen, nicht als veraltete Antwort
     - /api/ – die Erkennung der Betriebsart (betrieb.js) muss die echte
       Antwort sehen

   Auf GitHub Pages teilen sich mehrere Zahlenkompass-Apps eine Herkunft
   (dlieb91.github.io) und damit einen Topf an Zwischenspeichern. Aufgeraeumt
   werden deshalb nur die eigenen, erkennbar am Praefix. */

const PRAEFIX = 'stundenkompass-';
const CACHE = PRAEFIX + 'huelle-v1';

const HUELLE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './bilder/icon-180.png',
  './bilder/icon-192.png',
  './bilder/icon-512.png',
];

self.addEventListener('install', (e) => {
  /* Fehlt eine Datei, soll nicht die ganze Installation scheitern –
     der Rest wird beim ersten Abruf nachgelegt. */
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(HUELLE.map((p) => c.add(p))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen
        .filter((n) => n.startsWith(PRAEFIX) && n !== CACHE)
        .map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;
  if (url.pathname.includes('/api/')) return;

  /* `cache: 'no-store'` ist der Kern: Ohne das darf der Browser die Anfrage
     aus seinem **eigenen** Zwischenspeicher bedienen, und dann hilft es
     nichts, dass hier das Netz zuerst gefragt wird. */
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(CACHE).then((c) => c.put(e.request, kopie));
        }
        return antwort;
      })
      .catch(async () => {
        const treffer = await caches.match(e.request);
        if (treffer) return treffer;
        if (e.request.mode === 'navigate') {
          const start = await caches.match('./index.html');
          if (start) return start;
        }
        throw new Error('offline und nicht im Zwischenspeicher');
      })
  );
});
