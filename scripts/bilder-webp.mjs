/**
 * Erzeugt WebP-Fassungen der Team-Portraits neben den PNG-Originalen.
 *
 * Die Quellen sind 271×271 große PNGs mit 88 bis 140 KB, angezeigt werden sie
 * mit 132 px. Der Alphakanal ist zwar vorhanden, aber vollständig deckend
 * (nachgeprüft über sharp().stats().isOpaque) – er kostet also nur Bytes. Die
 * runde Form macht ohnehin das CSS über rounded-full, nicht das Bild.
 *
 * Die PNGs bleiben liegen: team.html bindet über <picture> ein, WebP zuerst,
 * PNG als Fallback. Dieselbe Konvention verfolgt src/input.css schon bei
 * Franklin mit woff2 und woff.
 *
 * Das Skript ist idempotent und läuft nur über vorhandene PNGs. Es schreibt
 * nie ein PNG und löscht nie etwas.
 *
 *   node scripts/bilder-webp.mjs           erzeugt fehlende und veraltete WebP
 *   node scripts/bilder-webp.mjs --force   erzeugt alle neu
 */

import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUELLE = join(ROOT, 'team');
const QUALITAET = 80;
const FORCE = process.argv.includes('--force');

const ok = (t) => console.log(`  \x1b[32m✓\x1b[0m ${t}`);
const abbruch = (t) => { console.error(`\n\x1b[31mAbbruch:\x1b[0m ${t}\n`); process.exit(1); };
const kb = (n) => `${Math.round(n / 1024)} KB`;

const pngs = readdirSync(QUELLE).filter((d) => d.endsWith('.png')).sort();
if (pngs.length === 0) abbruch(`Keine PNG in ${QUELLE}.`);

console.log(`\n  ${pngs.length} PNG in team/, Qualität ${QUALITAET}\n`);

let vorher = 0;
let nachher = 0;
let erzeugt = 0;

for (const datei of pngs) {
  const png = join(QUELLE, datei);
  const webp = png.replace(/\.png$/, '.webp');
  const pngStat = statSync(png);

  /* Nur neu bauen, wenn das WebP fehlt oder älter als die Quelle ist. Sonst
     ändert ein Lauf ohne Anlass sechs Dateien und bläht das Diff auf. */
  let aktuell = false;
  try {
    aktuell = !FORCE && statSync(webp).mtimeMs >= pngStat.mtimeMs;
  } catch { /* existiert noch nicht */ }

  if (aktuell) {
    vorher += pngStat.size;
    nachher += statSync(webp).size;
    console.log(`  · ${datei.padEnd(26)} unverändert`);
    continue;
  }

  /* Der Alphakanal ist bei allen Quellen deckend. Bleibt er drin, zahlt jedes
     Bild einen vierten Kanal ohne Gegenwert – deshalb flach auf Weiß. Sollte
     jemals ein freigestelltes Portrait dazukommen, schlägt die Prüfung an. */
  const stats = await sharp(png).stats();
  if (!stats.isOpaque) {
    abbruch(`${datei} hat eine echte Transparenz. Die Umwandlung würde sie auf `
      + 'Weiß auflösen. Entweder Alphakanal erhalten oder die Datei aus diesem '
      + 'Lauf herausnehmen.');
  }

  await sharp(png)
    .flatten({ background: '#ffffff' })
    .webp({ quality: QUALITAET, effort: 6 })
    .toFile(webp);

  const neu = statSync(webp).size;
  vorher += pngStat.size;
  nachher += neu;
  erzeugt += 1;

  const ersparnis = Math.round((1 - neu / pngStat.size) * 100);
  console.log(`  ✓ ${datei.padEnd(26)} ${kb(pngStat.size).padStart(7)} → ${kb(neu).padStart(7)}  −${ersparnis} %`);
}

console.log('');
ok(`${erzeugt} erzeugt, ${pngs.length - erzeugt} unverändert`);
ok(`Gesamt ${kb(vorher)} → ${kb(nachher)} (−${Math.round((1 - nachher / vorher) * 100)} %)`);
console.log('');
