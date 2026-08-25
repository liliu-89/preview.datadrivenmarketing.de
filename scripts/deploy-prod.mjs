/**
 * Überträgt den Stand dieses Repos nach liliu-89/datadrivenmarketing.de.
 *
 * Der Sinn ist nicht Bequemlichkeit, sondern eine Fehlerklasse auszuschließen:
 * Die Vorschau zeigt auf ddm-*-preview, die Produktion muss auf ddm-*-prod
 * zeigen. Bleibt beim Kopieren von Hand ein Endpunkt stehen, schreibt das
 * Formular in Produktion still in die Vorschau-Datenbank, ohne dass etwas
 * fehlschlägt. Deshalb hat hier jede Umschreibung eine erwartete Trefferzahl,
 * und eine Abweichung bricht ab.
 *
 * Es wird nur ein Branch gepusht, nie gemergt. Live geht ein Stand erst durch
 * ein bewusstes Merge auf main.
 *
 *   node scripts/deploy-prod.mjs           legt an und pusht
 *   node scripts/deploy-prod.mjs --dry-run baut und prüft, ohne zu pushen
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ZIEL_REPO = 'git@github.com:liliu-89/datadrivenmarketing.de.git';
const ZIEL_WEB = 'https://github.com/liliu-89/datadrivenmarketing.de';
const DOMAIN = 'https://datadrivenmarketing.de';
const DRY = process.argv.includes('--dry-run');

const sh = (cmd, args, cwd = ROOT) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const schritt = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const ok = (t) => console.log(`  \x1b[32m✓\x1b[0m ${t}`);
const abbruch = (t) => { console.error(`\n\x1b[31mAbbruch:\x1b[0m ${t}\n`); process.exit(1); };

/* ── Was ausgeliefert wird ──────────────────────────────────────────────
   Bewusst eine Positivliste. Eine Negativliste würde jede neue Bau- oder
   Backend-Datei stillschweigend nach Produktion tragen. */
const SEITEN = [
  'index.html', 'team.html', 'marketing-audit.html', 'impressum.html', 'datenschutz.html',
  'cases/google-ads-leadgenerierung.html', 'cases/microsoft-ads-profitabel-machen.html',
];
const DATEIEN = [...SEITEN, 'script.js', '.nojekyll', 'dist/output.css'];
const ORDNER = ['font', 'images', 'Logos', 'team'];

/* Diese beiden behalten noindex. Alle anderen verlieren es. */
const BLEIBT_NOINDEX = ['impressum.html', 'datenschutz.html'];
const INDEXIERBAR = SEITEN.filter((f) => !BLEIBT_NOINDEX.includes(f));

const url = (datei) =>
  datei === 'index.html' ? `${DOMAIN}/` : `${DOMAIN}/${datei.replace(/\.html$/, '')}`;

/* ── 1. Vorbedingungen ─────────────────────────────────────────────── */
schritt('1. Vorbedingungen');

if (sh('git', ['status', '--porcelain'])) {
  abbruch('Das Arbeitsverzeichnis ist nicht sauber. Erst committen, dann deployen.');
}
ok('Arbeitsverzeichnis sauber');

const css = statSync(join(ROOT, 'dist/output.css')).mtimeMs;
const quelle = statSync(join(ROOT, 'src/input.css')).mtimeMs;
if (css < quelle) abbruch('dist/output.css ist älter als src/input.css. Erst "npm run build".');
ok('dist/output.css ist aktuell');

const commit = sh('git', ['rev-parse', '--short', 'HEAD']);
ok(`Quellstand ${commit}`);

/* ── 2. Zielrepo klonen ────────────────────────────────────────────── */
schritt('2. Zielrepo klonen');
const arbeit = mkdtempSync(join(tmpdir(), 'ddm-deploy-'));
sh('git', ['clone', '--quiet', ZIEL_REPO, arbeit], tmpdir());
ok(`geklont nach ${arbeit}`);

/* Notfallstand festhalten, um am Ende zu belegen, dass er unberührt blieb. */
const maintenance = sh('git', ['branch', '-r'], arbeit)
  .split('\n').map((b) => b.trim())
  .filter((b) => /maintenance/i.test(b));
const maintenanceVorher = maintenance.map((b) => `${b} ${sh('git', ['rev-parse', b], arbeit)}`);
maintenanceVorher.forEach((b) => ok(`unberührt zu halten: ${b}`));

/* ── 3. Branch bestimmen ───────────────────────────────────────────── */
schritt('3. Branch');
const heute = new Date().toISOString().slice(0, 10);
const vergeben = new Set(sh('git', ['branch', '-r'], arbeit).split('\n').map((b) => b.trim().replace(/^origin\//, '')));
let branch = `release/${heute}`;
for (let i = 2; vergeben.has(branch); i++) branch = `release/${heute}-${i}`;

/* Die Sperre steht bewusst hier und nicht nur in der Namensbildung: Wer den
   Namen später von Hand setzt, läuft trotzdem dagegen. */
if (!branch.startsWith('release/')) abbruch(`"${branch}" beginnt nicht mit release/.`);
if (/maintenance/i.test(branch)) abbruch(`"${branch}" enthält "maintenance". Der Notfallstand wird nie überschrieben.`);
sh('git', ['checkout', '--quiet', '-b', branch], arbeit);
ok(`${branch} von main abgezweigt`);

/* ── 4. Artefakt aufbauen ──────────────────────────────────────────── */
schritt('4. Artefakt aufbauen');

/* Zielverzeichnis leeren, damit entfernte Dateien nicht liegen bleiben.
   Ohne das überlebte ein gelöschtes Logo als verwaiste, weiter abrufbare
   Datei auf der Produktivdomain. */
for (const e of readdirSync(arbeit)) {
  if (e !== '.git') rmSync(join(arbeit, e), { recursive: true, force: true });
}

for (const d of DATEIEN) {
  mkdirSync(dirname(join(arbeit, d)), { recursive: true });
  cpSync(join(ROOT, d), join(arbeit, d));
}
for (const o of ORDNER) cpSync(join(ROOT, o), join(arbeit, o), { recursive: true });
ok(`${DATEIEN.length} Dateien und ${ORDNER.length} Verzeichnisse kopiert`);

/* ── 5. Umschreiben ────────────────────────────────────────────────── */
schritt('5. Umschreiben');

const zaehle = (text, muster) => (text.match(new RegExp(muster, 'g')) || []).length;
let gesamt = { consent: 0, leads: 0, noindex: 0 };

for (const f of SEITEN) {
  const pfad = join(arbeit, f);
  let s = readFileSync(pfad, 'utf8');

  gesamt.consent += zaehle(s, 'ddm-consent-preview');
  s = s.replaceAll('ddm-consent-preview', 'ddm-consent-prod');

  gesamt.leads += zaehle(s, 'ddm-leads-preview');
  s = s.replaceAll('ddm-leads-preview', 'ddm-leads-prod');

  if (!BLEIBT_NOINDEX.includes(f)) {
    const vorher = s;
    s = s.replace(/^[ \t]*<meta name="robots" content="noindex, nofollow" \/>\n/m, '');
    if (s !== vorher) gesamt.noindex += 1;
  }

  writeFileSync(pfad, s);
}

const erwartet = { consent: 14, leads: 1, noindex: INDEXIERBAR.length };
for (const [k, v] of Object.entries(erwartet)) {
  if (gesamt[k] !== v) {
    abbruch(`Umschreibung "${k}": ${gesamt[k]} Treffer statt ${v}. Das Markup hat sich geändert; `
      + 'die Regel würde ins Leere laufen und Preview-Endpunkte nach Produktion tragen.');
  }
  ok(`${k}: ${gesamt[k]} Treffer wie erwartet`);
}

writeFileSync(join(arbeit, 'CNAME'), 'datadrivenmarketing.de\n');
ok('CNAME auf die Produktivdomain gesetzt');

writeFileSync(join(arbeit, 'robots.txt'),
  `# Produktionsdomain. Crawling ist erlaubt, auch fuer KI-Crawler:
# DDM bietet AI Visibility als Leistung an, die eigenen Inhalte dafuer zu
# sperren waere schwer zu erklaeren.
#
# Impressum und Datenschutzerklaerung tragen noindex im Quelltext und stehen
# deshalb nicht in der Sitemap. Gesperrt sind sie hier bewusst nicht: Eine
# per robots.txt gesperrte URL kann Google nicht abrufen und damit das
# noindex nicht lesen.

User-agent: *
Allow: /

Sitemap: ${DOMAIN}/sitemap.xml
`);
ok('robots.txt für die Produktion geschrieben');

const stand = new Date().toISOString().slice(0, 10);
writeFileSync(join(arbeit, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + INDEXIERBAR.map((f) =>
      `  <url>\n    <loc>${url(f)}</loc>\n    <lastmod>${stand}</lastmod>\n  </url>\n`).join('')
  + '</urlset>\n');
ok(`sitemap.xml mit ${INDEXIERBAR.length} URLs`);

/* ── 6. Prüfen ─────────────────────────────────────────────────────── */
schritt('6. Prüfen');

const alleDateien = (d, akku = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const p = join(d, e.name);
    e.isDirectory() ? alleDateien(p, akku) : akku.push(p);
  }
  return akku;
};

const textDateien = alleDateien(arbeit).filter((p) => /\.(html|js|css|txt|xml)$/.test(p));
const mitPreview = textDateien.filter((p) => readFileSync(p, 'utf8').includes('preview'));
if (mitPreview.length) {
  abbruch(`"preview" steht noch in: ${mitPreview.map((p) => p.replace(arbeit + '/', '')).join(', ')}`);
}
ok('keine Erwähnung von "preview" im Artefakt');

const quelltexte = Object.fromEntries(SEITEN.map((f) => [f, readFileSync(join(arbeit, f), 'utf8')]));
const sri = (readFileSync(join(ROOT, 'index.html'), 'utf8').match(/integrity="(sha384-[^"]+)"/) || [])[1];
if (!sri) abbruch('Kein SRI-Hash in der Quelle gefunden.');

for (const [f, s] of Object.entries(quelltexte)) {
  const skripte = zaehle(s, 'ddm-consent-prod\\.datadrivenmarketing\\.workers\\.dev/v[\\d.]+/consent\\.js');
  if (skripte !== 1) abbruch(`${f}: ${skripte} Consent-Skripte statt genau eins.`);
  if (!s.includes(sri)) abbruch(`${f}: SRI-Hash weicht von der Quelle ab.`);

  const hatNoindex = /content="noindex/.test(s);
  const sollNoindex = BLEIBT_NOINDEX.includes(f);
  if (hatNoindex !== sollNoindex) {
    abbruch(`${f}: noindex ${hatNoindex ? 'vorhanden' : 'fehlt'}, erwartet ${sollNoindex ? 'vorhanden' : 'fehlend'}.`);
  }
}
ok('je Seite genau ein Consent-Skript, SRI unverändert');
ok(`noindex nur auf ${BLEIBT_NOINDEX.join(' und ')}`);

for (const f of INDEXIERBAR) {
  try { statSync(join(arbeit, f)); } catch { abbruch(`Sitemap nennt ${url(f)}, aber ${f} fehlt im Artefakt.`); }
}
ok('jede Sitemap-URL hat eine Datei');

/* Logos beidseitig abgleichen: verwaiste Dateien blieben sonst öffentlich
   abrufbar, fehlende Dateien ergäben tote Bilder. */
const referenziert = new Set([...readFileSync(join(arbeit, 'index.html'), 'utf8')
  .matchAll(/Logo Bar\/([^"]+\.png)/g)].map((m) => m[1]));
const vorhanden = new Set(readdirSync(join(arbeit, 'Logos', 'Logos für Logo Bar')));
const verwaist = [...vorhanden].filter((d) => !referenziert.has(d));
const fehlend = [...referenziert].filter((d) => !vorhanden.has(d));
if (verwaist.length) abbruch(`Logodateien ohne Verweis: ${verwaist.join(', ')}`);
if (fehlend.length) abbruch(`Verwiesene Logos fehlen: ${fehlend.join(', ')}`);
ok(`${referenziert.size} Logos, Markup und Dateien decken sich`);

const bild = 'images/data_driven_marketing_Logo_darkgrey_1200x630.png';
try { statSync(join(arbeit, bild)); } catch { abbruch(`og:image fehlt: ${bild}`); }
for (const f of INDEXIERBAR) {
  const m = quelltexte[f].match(/property="og:image" content="([^"]+)"/);
  if (!m) abbruch(`${f}: og:image fehlt.`);
  if (!m[1].startsWith('https://')) abbruch(`${f}: og:image ist nicht absolut.`);
  if (/[ %]/.test(m[1])) abbruch(`${f}: og:image-URL enthält ein Leerzeichen oder eine Kodierung.`);
}
ok('og:image auf allen Inhaltsseiten, absolut und ohne Leerzeichen');

/* ── 7. Pushen ─────────────────────────────────────────────────────── */
schritt('7. Ergebnis');

sh('git', ['add', '-A'], arbeit);
if (!sh('git', ['status', '--porcelain'], arbeit)) {
  console.log('  Keine Unterschiede zum Zielstand. Nichts zu tun.');
  rmSync(arbeit, { recursive: true, force: true });
  process.exit(0);
}
console.log(sh('git', ['diff', '--cached', '--stat'], arbeit).split('\n').map((l) => '  ' + l).join('\n'));

sh('git', ['commit', '--quiet', '-m',
  `Website-Stand ${commit} nach Produktion\n\n`
  + `Erzeugt von scripts/deploy-prod.mjs aus dem Preview-Repo.\n`
  + `Worker-Endpunkte auf prod umgeschrieben, noindex auf den Inhaltsseiten\n`
  + `entfernt, robots.txt und sitemap.xml fuer die Produktion erzeugt.`], arbeit);

if (DRY) {
  console.log(`\n  Probelauf. Nicht gepusht. Artefakt liegt unter:\n  ${arbeit}\n`);
  process.exit(0);
}

sh('git', ['push', '--quiet', '-u', 'origin', branch], arbeit);
ok(`${branch} gepusht`);

/* Belegen, dass der Notfallstand unangetastet blieb. */
sh('git', ['fetch', '--quiet', 'origin'], arbeit);
for (const zeile of maintenanceVorher) {
  const [ref, alt] = zeile.split(' ');
  if (sh('git', ['rev-parse', ref], arbeit) !== alt) abbruch(`${ref} hat sich verändert. Das darf nicht passieren.`);
  ok(`${ref} unverändert auf ${alt.slice(0, 8)}`);
}

rmSync(arbeit, { recursive: true, force: true });

console.log(`\n\x1b[1mLive geht der Stand erst durch ein Merge auf main:\x1b[0m`);
console.log(`  ${ZIEL_WEB}/compare/main...${branch}\n`);
