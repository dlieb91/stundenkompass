/* xlsx-Schreiber ohne Fremdbibliothek – laeuft im Browser und in Node.

   Uebernommen aus dem Werkzeug des Skills zahlenkompass-tabelle, mit drei
   Unterschieden:
     – das ZIP wird ungepackt geschrieben (Verfahren „stored“). Das braucht
       kein zlib und keine asynchrone CompressionStream; ein Monatsbericht
       hat ohnehin nur einige zehn Kilobyte.
     – Ergebnis ist ein Uint8Array statt eines Node-Buffers.
     – dazu Seiteneinrichtung (Druck auf eine Seitenbreite) und Autofilter,
       ohne Diagramme und Datenpruefung.

   Was man wissen muss, bevor man hier etwas aendert:

   1. Die Reihenfolge der Elemente in sheet.xml ist vorgeschrieben:
      sheetPr, sheetViews, sheetFormatPr, cols, sheetData, autoFilter,
      mergeCells, conditionalFormatting, pageMargins, pageSetup.
      Vertauscht meldet Excel „Die Datei ist beschaedigt“ – ohne Angabe, wo.
   2. Formeln immer mit KOMMA als Argumenttrenner. Das Semikolon sieht der
      deutsche Nutzer nur in der Anzeige.
   3. Formelzellen bekommen keinen zwischengespeicherten Wert; fullCalcOnLoad
      zwingt jedes Programm, beim Oeffnen selbst zu rechnen. */

/* ---------- Hilfen ---------- */

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}

/** 1 -> A, 27 -> AA */
export function spalteName(n) {
  let s = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    s = String.fromCharCode(65 + rest) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export const zelleName = (zeile, spalte) => spalteName(spalte) + zeile;

/** Datum als Excel-Seriennummer (Bezug 30.12.1899, wegen des Schaltjahrfehlers 1900). */
export function datumsZahl(iso) {
  const [j, m, t] = String(iso).split('-').map(Number);
  return Date.UTC(j, m - 1, t) / 86400000 + 25569;
}

/** 'HH:MM' als Tagesbruchteil. */
export function uhrzeitZahl(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h * 60 + m) / 1440;
}

/* ---------- ZIP (ungepackt) ---------- */

const CRC_TABELLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABELLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** { name -> Zeichenkette } als ZIP. Fester Zeitstempel: gleiche Daten, gleiche Datei. */
export function zipSchreiben(dateien) {
  const enc = new TextEncoder();
  const zeit = (12 << 11);
  const tag = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const teile = [];
  const eintraege = [];
  let versatz = 0;

  for (const [name, text] of Object.entries(dateien)) {
    const inhalt = enc.encode(text);
    const nameB = enc.encode(name);
    const crc = crc32(inhalt);
    const kopf = new DataView(new ArrayBuffer(30));
    kopf.setUint32(0, 0x04034b50, true);
    kopf.setUint16(4, 20, true);
    kopf.setUint16(6, 0x0800, true);      // Namen in UTF-8
    kopf.setUint16(8, 0, true);           // stored
    kopf.setUint16(10, zeit, true);
    kopf.setUint16(12, tag, true);
    kopf.setUint32(14, crc, true);
    kopf.setUint32(18, inhalt.length, true);
    kopf.setUint32(22, inhalt.length, true);
    kopf.setUint16(26, nameB.length, true);
    kopf.setUint16(28, 0, true);
    teile.push(new Uint8Array(kopf.buffer), nameB, inhalt);
    eintraege.push({ nameB, crc, laenge: inhalt.length, versatz });
    versatz += 30 + nameB.length + inhalt.length;
  }

  let vzLaenge = 0;
  for (const e of eintraege) {
    const s = new DataView(new ArrayBuffer(46));
    s.setUint32(0, 0x02014b50, true);
    s.setUint16(4, 20, true);
    s.setUint16(6, 20, true);
    s.setUint16(8, 0x0800, true);
    s.setUint16(10, 0, true);
    s.setUint16(12, zeit, true);
    s.setUint16(14, tag, true);
    s.setUint32(16, e.crc, true);
    s.setUint32(20, e.laenge, true);
    s.setUint32(24, e.laenge, true);
    s.setUint16(28, e.nameB.length, true);
    s.setUint32(42, e.versatz, true);
    teile.push(new Uint8Array(s.buffer), e.nameB);
    vzLaenge += 46 + e.nameB.length;
  }

  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true);
  ende.setUint16(8, eintraege.length, true);
  ende.setUint16(10, eintraege.length, true);
  ende.setUint32(12, vzLaenge, true);
  ende.setUint32(16, versatz, true);
  teile.push(new Uint8Array(ende.buffer));

  const gesamt = new Uint8Array(teile.reduce((n, t) => n + t.length, 0));
  let p = 0;
  for (const t of teile) { gesamt.set(t, p); p += t.length; }
  return gesamt;
}

/* ---------- Stile ----------

   { schrift: { groesse, fett, kursiv, farbe, name },
     fuellung: 'F7F5F0',
     rahmen:   { oben, unten, links, rechts: 'thin'|'medium'|'none', farbe },
     ausrichtung: { h, v, umbruch, einzug },
     format: '[h]:mm' }                                                     */

class Stilbuch {
  constructor() {
    this.formate = [];
    this.schriften = [JSON.stringify({ groesse: 10, name: 'Calibri', fett: false, kursiv: false, farbe: null })];
    this.fuellungen = ['none', 'gray125'];
    this.rahmen = ['leer'];
    this.ausrichtungen = [];
    this.eintraege = [JSON.stringify({ n: 0, s: 0, f: 0, r: 0, a: -1 })];
    this.dxfs = [];
  }

  ablegen(liste, wert) {
    const i = liste.indexOf(wert);
    if (i >= 0) return i;
    liste.push(wert);
    return liste.length - 1;
  }

  stil(def = {}) {
    const s = this.ablegen(this.schriften, JSON.stringify({
      groesse: def.schrift?.groesse ?? 10,
      name: def.schrift?.name ?? 'Calibri',
      fett: !!def.schrift?.fett,
      kursiv: !!def.schrift?.kursiv,
      farbe: def.schrift?.farbe ?? null,
    }));
    const f = def.fuellung ? this.ablegen(this.fuellungen, def.fuellung) : 0;
    const r = def.rahmen ? this.ablegen(this.rahmen, JSON.stringify(def.rahmen)) : 0;
    const n = def.format ? 164 + this.ablegen(this.formate, def.format) : 0;
    const a = def.ausrichtung ? this.ablegen(this.ausrichtungen, JSON.stringify(def.ausrichtung)) : -1;
    return this.ablegen(this.eintraege, JSON.stringify({ n, s, f, r, a }));
  }

  dxf(def = {}) { return this.ablegen(this.dxfs, JSON.stringify(def)); }

  xml() {
    const schrift = (k) => {
      const o = JSON.parse(k);
      return '<font>' + `<sz val="${o.groesse}"/>` + (o.fett ? '<b/>' : '') + (o.kursiv ? '<i/>' : '')
        + (o.farbe ? `<color rgb="FF${o.farbe}"/>` : '') + `<name val="${esc(o.name)}"/></font>`;
    };
    const fuellung = (w) => (w === 'none' || w === 'gray125'
      ? `<fill><patternFill patternType="${w}"/></fill>`
      : `<fill><patternFill patternType="solid"><fgColor rgb="FF${w}"/><bgColor indexed="64"/></patternFill></fill>`);
    const rahmen = (k) => {
      if (k === 'leer') return '<border><left/><right/><top/><bottom/><diagonal/></border>';
      const o = JSON.parse(k);
      const farbe = o.farbe ? `<color rgb="FF${o.farbe}"/>` : '<color indexed="64"/>';
      const seite = (n, w) => (w && w !== 'none' ? `<${n} style="${w}">${farbe}</${n}>` : `<${n}/>`);
      return '<border>' + seite('left', o.links) + seite('right', o.rechts)
        + seite('top', o.oben) + seite('bottom', o.unten) + '<diagonal/></border>';
    };
    const xfs = this.eintraege.map((e) => {
      const { n, s, f, r, a: ai } = JSON.parse(e);
      const a = ai >= 0 ? JSON.parse(this.ausrichtungen[ai]) : null;
      const m = `numFmtId="${n}" fontId="${s}" fillId="${f}" borderId="${r}"`
        + (n ? ' applyNumberFormat="1"' : '') + (s ? ' applyFont="1"' : '')
        + (f ? ' applyFill="1"' : '') + (r ? ' applyBorder="1"' : '') + (a ? ' applyAlignment="1"' : '');
      if (!a) return `<xf ${m} xfId="0"/>`;
      const aus = [a.h ? `horizontal="${a.h}"` : '', a.v ? `vertical="${a.v}"` : '',
        a.umbruch ? 'wrapText="1"' : '', a.einzug ? `indent="${a.einzug}"` : ''].filter(Boolean).join(' ');
      return `<xf ${m} xfId="0"><alignment ${aus}/></xf>`;
    });
    const dxfs = this.dxfs.map((d) => {
      const o = JSON.parse(d);
      return '<dxf>'
        + (o.schrift ? '<font>' + (o.schrift.fett ? '<b/>' : '') + (o.schrift.kursiv ? '<i/>' : '')
          + (o.schrift.farbe ? `<color rgb="FF${o.schrift.farbe}"/>` : '') + '</font>' : '')
        + (o.fuellung ? `<fill><patternFill><bgColor rgb="FF${o.fuellung}"/></patternFill></fill>` : '')
        + '</dxf>';
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + (this.formate.length ? `<numFmts count="${this.formate.length}">`
        + this.formate.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('') + '</numFmts>' : '')
      + `<fonts count="${this.schriften.length}">${this.schriften.map(schrift).join('')}</fonts>`
      + `<fills count="${this.fuellungen.length}">${this.fuellungen.map(fuellung).join('')}</fills>`
      + `<borders count="${this.rahmen.length}">${this.rahmen.map(rahmen).join('')}</borders>`
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
      + '<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles>'
      + `<dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs>`
      + '</styleSheet>';
  }
}

/* ---------- Zellen und Blaetter ---------- */

function zelleXml(zeile, spalte, zelle, s) {
  const bezug = zelleName(zeile, spalte);
  const st = s ? ` s="${s}"` : '';
  if (zelle == null || zelle === '') return '';
  if (typeof zelle === 'object' && zelle.f) return `<c r="${bezug}"${st}><f>${esc(zelle.f)}</f></c>`;
  const wert = typeof zelle === 'object' ? zelle.w : zelle;
  if (wert == null || wert === '') return st ? `<c r="${bezug}"${st}/>` : '';
  if (typeof wert === 'number') return `<c r="${bezug}"${st}><v>${wert}</v></c>`;
  if (typeof wert === 'boolean') return `<c r="${bezug}"${st} t="b"><v>${wert ? 1 : 0}</v></c>`;
  return `<c r="${bezug}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(wert)}</t></is></c>`;
}

function blattXml(blatt, buch) {
  const t = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];

  const pr = (blatt.registerfarbe ? `<tabColor rgb="FF${blatt.registerfarbe}"/>` : '')
    + (blatt.druck ? '<pageSetUpPr fitToPage="1"/>' : '');
  if (pr) t.push(`<sheetPr>${pr}</sheetPr>`);

  const gitter = blatt.gitternetz === false ? ' showGridLines="0"' : '';
  let ansicht = `<sheetView${gitter}${blatt.aktiv ? ' tabSelected="1"' : ''} workbookViewId="0"`;
  if (blatt.fixieren) {
    const { zeile = 0, spalte = 0 } = blatt.fixieren;
    ansicht += '>' + `<pane${spalte ? ` xSplit="${spalte}"` : ''}${zeile ? ` ySplit="${zeile}"` : ''}`
      + ` topLeftCell="${zelleName(zeile + 1, spalte + 1)}" activePane="${spalte ? 'bottomRight' : 'bottomLeft'}" state="frozen"/>`
      + '</sheetView>';
  } else ansicht += '/>';
  t.push(`<sheetViews>${ansicht}</sheetViews>`);
  t.push(`<sheetFormatPr defaultRowHeight="${blatt.zeilenhoehe || 15}"/>`);

  if (blatt.spalten?.length) {
    const cols = blatt.spalten.map((c, i) => (!c ? '' : `<col min="${i + 1}" max="${i + 1}"`
      + (c.breite ? ` width="${c.breite}" customWidth="1"` : '') + (c.versteckt ? ' hidden="1"' : '') + '/>')).join('');
    if (cols) t.push(`<cols>${cols}</cols>`);
  }

  const zeilen = [];
  (blatt.zeilen || []).forEach((zeile, zi) => {
    if (!zeile) return;
    const nr = zi + 1;
    const zellen = (zeile.zellen || []).map((z, si) => {
      const s = z && typeof z === 'object' && z.s ? buch.stil(z.s) : 0;
      return zelleXml(nr, si + 1, z, s);
    }).join('');
    const hoehe = zeile.hoehe ? ` ht="${zeile.hoehe}" customHeight="1"` : '';
    if (zellen || hoehe) zeilen.push(`<row r="${nr}"${hoehe}>${zellen}</row>`);
  });
  t.push(`<sheetData>${zeilen.join('')}</sheetData>`);

  if (blatt.filter) t.push(`<autoFilter ref="${blatt.filter}"/>`);
  if (blatt.verbunden?.length) {
    t.push(`<mergeCells count="${blatt.verbunden.length}">`
      + blatt.verbunden.map((b) => `<mergeCell ref="${b}"/>`).join('') + '</mergeCells>');
  }
  let rang = 1;
  for (const regel of blatt.bedingt || []) {
    t.push(`<conditionalFormatting sqref="${regel.bereich}">`
      + `<cfRule type="expression" dxfId="${buch.dxf(regel.stil)}" priority="${rang++}">`
      + `<formula>${esc(regel.formel)}</formula></cfRule></conditionalFormatting>`);
  }
  t.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>');
  if (blatt.druck) {
    t.push(`<pageSetup paperSize="9" orientation="${blatt.druck.quer ? 'landscape' : 'portrait'}"`
      + ` fitToWidth="1" fitToHeight="${blatt.druck.eineSeite ? 1 : 0}"/>`);
  }
  t.push('</worksheet>');
  return t.join('');
}

/**
 * mappeSchreiben({ blaetter, namen }) -> Uint8Array (.xlsx)
 * namen: { Name: "Blatt!$A$1" } oder { Name: { ziel, blatt: index, versteckt } }
 */
export function mappeSchreiben({ blaetter, namen = {} }) {
  const buch = new Stilbuch();
  const d = {};
  const blattXmls = blaetter.map((b) => blattXml(b, buch));

  d['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + blaetter.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>';

  d['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';

  const namenListe = Object.entries(namen).map(([n, z]) => {
    const o = typeof z === 'string' ? { ziel: z } : z;
    return `<definedName name="${esc(n)}"${o.blatt != null ? ` localSheetId="${o.blatt}"` : ''}`
      + `${o.versteckt ? ' hidden="1"' : ''}>${esc(o.ziel)}</definedName>`;
  });

  d['xl/workbook.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<bookViews><workbookView activeTab="0"/></bookViews>'
    + '<sheets>' + blaetter.map((b, i) => `<sheet name="${esc(b.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>'
    + (namenListe.length ? `<definedNames>${namenListe.join('')}</definedNames>` : '')
    + '<calcPr calcId="0" fullCalcOnLoad="1"/>'
    + '</workbook>';

  d['xl/_rels/workbook.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + blaetter.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${blaetter.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + '</Relationships>';

  blattXmls.forEach((x, i) => { d[`xl/worksheets/sheet${i + 1}.xml`] = x; });
  d['xl/styles.xml'] = buch.xml();
  return zipSchreiben(d);
}
