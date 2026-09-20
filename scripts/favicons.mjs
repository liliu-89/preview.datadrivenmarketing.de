/**
 * Erzeugt den Favicon-Satz aus dem offiziellen Signet.
 *
 *   node scripts/favicons.mjs
 *
 * Warum ueberhaupt PNG und ICO, wo doch ein SVG-Favicon existierte: WebKit
 * unterstuetzt keine SVG-Favicons. Chrome und Safari auf iOS hatten damit
 * gar kein Icon und behalfen sich mit einem Platzhalter.
 *
 * Verwendet wird das dunkelgraue Signet. Seine Farbe kommt aus der
 * eigenen Datei, es wird nichts umgefaerbt.
 *
 * Der Hintergrund ist bewusst unterschiedlich:
 * - Favicons sind freigestellt. Der Browser setzt sie auf den Grund der
 *   Tableiste, so sah es vor dem Favicon-Satz auch aus. Preis dafuer: In
 *   einer dunklen Tableiste steht dunkles Zeichen auf dunklem Grund.
 * - Das apple-touch-icon bleibt deckend weiss. iOS unterlegt Transparenz
 *   mit Schwarz, worauf das dunkle Zeichen unsichtbar waere. Apple
 *   erwartet ein deckendes Bild und legt die abgerundete Maske selbst an.
 *
 * Die viewBox wird 1:1 auf die Kachel abgebildet, ohne zusaetzlichen Rand.
 * Genau so rendert ein Browser ein SVG-Favicon, und genau so sah das alte
 * Icon aus: Das Zeichen fuellt 96,7 % der Breite, den schmalen Rest traegt
 * der Rand im Pfad selbst. Ein eigener Rand liess das Zeichen sichtbar
 * kleiner wirken als vorher.
 * Fuer das App-Icon gilt dasselbe. iOS legt darueber seine abgerundete
 * Maske; weil das Signet eine gefuellte Flaeche mit Aussparung ist, rundet
 * die Maske dessen Ecken mit, statt etwas Erkennbares abzuschneiden.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUELLE = join(ROOT, 'Logos', 'ddm Logo svg', 'Signet_darkgrey.svg');
const GRUND_APP = '#ffffff'; // nur das App-Icon, siehe Kopfkommentar

/* Pfad UND Farbe aus dem offiziellen Signet uebernehmen statt sie zu
   kopieren: Wird das Signet je ersetzt oder umgefaerbt, zieht dieser
   Generator automatisch nach. */
const quelle = readFileSync(QUELLE, 'utf8');
const pfad = /\sd="([^"]+)"/.exec(quelle)?.[1];
const box = /viewBox="([^"]+)"/.exec(quelle)?.[1];
const zeichenfarbe = /fill="(#[0-9a-fA-F]{3,8})"/.exec(quelle)?.[1];
if (!pfad || !box || !zeichenfarbe) throw new Error(`Pfad, viewBox oder fill fehlt in ${QUELLE}`);
const [, , bBreite, bHoehe] = box.split(/\s+/).map(Number);

/** Signet auf der Kachel. `grund` = null laesst die Flaeche frei. */
const bild = (kante, anteil, grund) => {
  const zeichen = kante * anteil;
  const skala = zeichen / Math.max(bBreite, bHoehe);
  const x = (kante - bBreite * skala) / 2;
  const y = (kante - bHoehe * skala) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${kante}" height="${kante}" viewBox="0 0 ${kante} ${kante}">`
    + (grund ? `<rect width="${kante}" height="${kante}" fill="${grund}"/>` : '')
    + `<g transform="translate(${x} ${y}) scale(${skala})"><path d="${pfad}" fill="${zeichenfarbe}"/></g>`
    + `</svg>`);
};

/* Hoch rastern, dann auf die Zielkante verkleinern: Das glaettet die
   Rundungen des Signets deutlich besser als direktes Rastern in 16 px.
   Die Verkleinerung ist noetig, weil eine hohe density die im SVG
   angegebene Pixelgroesse mitskaliert - ohne resize kaeme aus einer
   16-px-Vorlage ein 85-px-Bild.
   removeAlpha() nimmt den Kanal ganz heraus: Die Flaeche ist ohnehin
   deckend, und ein apple-touch-icon ohne Alphakanal ist das, was Apple
   erwartet. */
const png = (kante, anteil, grund) => {
  const s = sharp(bild(kante, anteil, grund), { density: 72 * 8 })
    .resize(kante, kante, { fit: 'fill', background: '#00000000' });
  /* Den Alphakanal nur beim deckenden App-Icon entfernen: Apple erwartet
     ein Bild ohne Alpha, die freigestellten Favicons brauchen ihn. */
  return (grund ? s.removeAlpha() : s).png({ compressionLevel: 9 }).toBuffer();
};

/* ICO mit eingebetteten PNGs. Das ist seit Vista das uebliche Format und
   wird von allen Zielbrowsern gelesen; eine BMP-Variante waere groesser
   ohne Gewinn. Aufbau: ICONDIR, dann je Groesse ein 16-Byte-Eintrag,
   danach die Bilddaten am angegebenen Versatz. */
const ico = (bilder) => {
  const kopf = Buffer.alloc(6);
  kopf.writeUInt16LE(0, 0);             // reserviert
  kopf.writeUInt16LE(1, 2);             // Typ 1 = Icon
  kopf.writeUInt16LE(bilder.length, 4);

  let versatz = 6 + bilder.length * 16;
  const eintraege = bilder.map(({ kante, daten }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(kante >= 256 ? 0 : kante, 0);  // 0 steht fuer 256
    e.writeUInt8(kante >= 256 ? 0 : kante, 1);
    e.writeUInt8(0, 2);                          // keine Farbpalette
    e.writeUInt8(0, 3);                          // reserviert
    e.writeUInt16LE(1, 4);                       // Ebenen
    e.writeUInt16LE(32, 6);                      // Bit je Pixel
    e.writeUInt32LE(daten.length, 8);
    e.writeUInt32LE(versatz, 12);
    versatz += daten.length;
    return e;
  });
  return Buffer.concat([kopf, ...eintraege, ...bilder.map((b) => b.daten)]);
};

const ziel = (name) => join(ROOT, name);

/* Ueberall 1: die viewBox deckt die Kachel, wie beim alten SVG-Favicon. */
const ANTEIL = 1;
const [f16, f32, f48, apple] = await Promise.all([
  png(16, ANTEIL, null), png(32, ANTEIL, null), png(48, ANTEIL, null),
  png(180, ANTEIL, GRUND_APP),
]);

writeFileSync(ziel('favicon-16x16.png'), f16);
writeFileSync(ziel('favicon-32x32.png'), f32);
writeFileSync(ziel('apple-touch-icon.png'), apple);
writeFileSync(ziel('favicon.ico'), ico([
  { kante: 16, daten: f16 },
  { kante: 32, daten: f32 },
  { kante: 48, daten: f48 },
]));

for (const [name, daten] of [
  ['favicon.ico', ico([{ kante: 16, daten: f16 }, { kante: 32, daten: f32 }, { kante: 48, daten: f48 }])],
  ['favicon-16x16.png', f16], ['favicon-32x32.png', f32], ['apple-touch-icon.png', apple],
]) {
  console.log(`  ${name.padEnd(22)} ${String(daten.length).padStart(6)} B`);
}
