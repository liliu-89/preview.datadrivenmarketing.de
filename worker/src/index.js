/**
 * DDM – Kontaktformular-Endpunkt
 *
 * Nimmt POST /api/contact entgegen, prüft die Eingaben und schreibt
 * einen Datensatz nach Cloudflare D1 (Binding `DB`).
 *
 * Keine Dependencies. Keine Secrets im Code – das D1-Binding kommt aus
 * wrangler.toml, nicht aus dem Quelltext.
 *
 * Zum Origin-Check weiter unten: Er steuert ausschließlich die
 * CORS-Header. Das ist weder Authentifizierung noch Spam-Schutz –
 * `Origin` ist ein HTTP-Header und außerhalb des Browsers frei
 * setzbar. Er verhindert lediglich, dass ein Formular auf einer
 * fremden Seite im Browser erfolgreich hierher postet.
 */

const ALLOWED_ORIGINS = new Set([
  'https://preview.datadrivenmarketing.de',
  'https://datadrivenmarketing.de',
  'https://www.datadrivenmarketing.de',
  'http://localhost:4173',
]);

/** Muss den <option>-Werten in index.html entsprechen. */
const BUDGET_VALUES = new Set(['', 'unter-5k', '5-10k', '10-30k', '30k+']);

const MAX_LENGTH = { firstName: 100, company: 200, email: 254, source: 64 };

/** Bewusst dieselbe Regex wie im Frontend – dort Komfort, hier verbindlich. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MESSAGES = {
  validation: 'Bitte prüfen Sie Ihre Eingaben.',
  method: 'Method not allowed.',
  notFound: 'Not found.',
  server: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.',
};

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    // Ohne Vary könnten Caches die Antwort für eine andere Origin ausliefern.
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(body, status, origin, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
      ...extra,
    },
  });
}

const fail = (origin, status, error) => json({ success: false, error }, status, origin);

/** Nimmt nur Strings an und schneidet Rand-Leerzeichen ab. */
function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Prüft die erwarteten Felder und gibt entweder die bereinigten Werte
 * oder null zurück. Alles, was nicht erwartet wird, fällt weg – der
 * Aufrufer kann also beliebige Zusatzfelder schicken, gespeichert wird
 * nichts davon.
 */
function validate(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const firstName = str(payload.firstName);
  const company = str(payload.company);
  const email = str(payload.email);
  const adsBudget = str(payload.budget);

  if (!firstName || firstName.length > MAX_LENGTH.firstName) return null;
  if (!company || company.length > MAX_LENGTH.company) return null;
  if (!email || email.length > MAX_LENGTH.email || !EMAIL_PATTERN.test(email)) return null;
  if (!BUDGET_VALUES.has(adsBudget)) return null;

  // Ohne Einwilligung wird nicht gespeichert.
  if (payload.consent !== true) return null;

  // Herkunft ist optional und darf niemals zum Fehler führen: auf
  // unbedenkliche Zeichen reduzieren, notfalls auf den Default fallen.
  const source =
    str(payload.source).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, MAX_LENGTH.source) ||
    'website';

  return { firstName, company, email, adsBudget: adsBudget || null, source };
}

/* ══════════════════════════════════════════════════════════════════════
 *  BENACHRICHTIGUNG
 * ════════════════════════════════════════════════════════════════════ */

/**
 * Meldet eine neue Anfrage per E-Mail über Mailjet.
 *
 * Läuft ausschließlich in ctx.waitUntil, nachdem der Datensatz in D1 steht.
 * Der Versand darf den Lead unter keinen Umständen gefährden: Antwortet
 * Mailjet nicht oder fehlt ein Schlüssel, bekommt der Besucher trotzdem seine
 * Bestätigung und der Datensatz bleibt erhalten. Deshalb wirft diese Funktion
 * nie und fängt alles selbst ab.
 *
 * Empfänger und Absender stehen als Variablen in wrangler.toml, nicht hier.
 * Eine weitere Adresse aufzunehmen ist damit eine Konfigurationsänderung,
 * keine Codeänderung.
 */
async function notify(env, lead, createdAt, id) {
  const key = env.MAILJET_API_KEY;
  const secret = env.MAILJET_SECRET_KEY;
  const from = str(env.NOTIFY_FROM);
  const to = str(env.NOTIFY_TO).split(',').map(str).filter(Boolean);

  if (!key || !secret || !from || !to.length) {
    // Kein Fehler, sondern ein Zustand: Ohne Konfiguration wird nicht
    // benachrichtigt, gespeichert aber sehr wohl.
    console.log('notify skipped', { id, configured: false });
    return;
  }

  const zeit = new Date(createdAt).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short',
  });

  const text = [
    `Vorname:     ${lead.firstName}`,
    `Firma:       ${lead.company}`,
    `E-Mail:      ${lead.email}`,
    `Ads-Budget:  ${lead.adsBudget || 'keine Angabe'}`,
    `Herkunft:    ${lead.source}`,
    `Eingegangen: ${zeit} Uhr`,
    '',
    `Alle Anfragen: ${str(env.ADMIN_URL) || '(ADMIN_URL nicht gesetzt)'}`,
  ].join('\n');

  try {
    const res = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        // Basic Auth aus API Key und Secret Key, so verlangt es Mailjet.
        Authorization: 'Basic ' + btoa(`${key}:${secret}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Messages: [{
          From: { Email: from, Name: 'DDM Website' },
          To: to.map((Email) => ({ Email })),
          // Der feste Teil steht vorn, damit eine Filterregel im Postfach
          // zuverlaessig darauf greifen kann. Die Firma dahinter macht die
          // Meldung in der Uebersicht sofort einordenbar.
          Subject: `Neue Anfrage über Ihr Formular auf datadrivenmarketing.de: ${lead.company}`,
          TextPart: text,
        }],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      // Nur der Statuscode, nie die Antwort selbst: Mailjet spiegelt die
      // Empfängeradressen zurück, die gehören nicht in die Logs.
      console.log('notify sent', { id, status: res.status });
      return;
    }

    // Im Fehlerfall braucht es einen Anhaltspunkt, sonst steht man vor einer
    // nackten Zahl. Mailjets Meldung beschreibt die Ursache, kann bei
    // Validierungsfehlern aber eine Adresse enthalten – deshalb maskiert.
    let grund = '';
    try {
      const body = await res.json();
      grund = String((body && (body.ErrorMessage || body.Message)) || '')
        .replace(/[^\s@]+@[^\s@]+/g, '[adresse]')
        .slice(0, 200);
    } catch (_) { /* Antwort ohne JSON-Body */ }
    console.error('notify rejected', { id, status: res.status, grund });
  } catch (err) {
    console.error('notify failed', { id, message: err && err.message });
  }
}

/* ══════════════════════════════════════════════════════════════════════
 *  ÜBERSICHT
 * ════════════════════════════════════════════════════════════════════ */

/** Vergleich in konstanter Zeit, damit die Antwortdauer nichts verrät. */
function sicherGleich(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  // Bei ungleicher Länge trotzdem durchlaufen, sonst verrät die Laufzeit sie.
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i % x.length] || 0) ^ (y[i % y.length] || 0);
  }
  return diff === 0;
}

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function adminSeite(zeilen) {
  const rows = zeilen.map((r) => `<tr>
      <td>${esc(new Date(r.created_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }))}</td>
      <td>${esc(r.first_name)}</td>
      <td>${esc(r.company)}</td>
      <td><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td>
      <td>${esc(r.ads_budget || '–')}</td>
      <td>${esc(r.source)}</td>
    </tr>`).join('');

  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Anfragen</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 1.5rem; color: #111; background: #fff; }
  h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
  p.meta { color: #555; margin: 0 0 1.5rem; font-size: .875rem; }
  div.scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; min-width: 40rem; }
  th, td { text-align: left; padding: .6rem .75rem; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { font-size: .8125rem; text-transform: uppercase; letter-spacing: .03em; color: #555; }
  tr:hover td { background: #f6f7f9; }
  a { color: #2d4682; }
  p.leer { color: #555; }
</style></head><body>
<h1>Anfragen über das Kontaktformular</h1>
<p class="meta">${zeilen.length} ${zeilen.length === 1 ? 'Eintrag' : 'Einträge'}, neueste zuerst.</p>
${zeilen.length ? `<div class="scroll"><table>
<thead><tr><th>Eingegangen</th><th>Vorname</th><th>Firma</th><th>E-Mail</th><th>Budget</th><th>Herkunft</th></tr></thead>
<tbody>${rows}</tbody></table></div>` : '<p class="leer">Noch keine Anfragen.</p>'}
</body></html>`;
}

async function admin(request, env) {
  const nutzer = env.ADMIN_USER;
  const passwort = env.ADMIN_PASSWORD;

  // Ohne hinterlegte Zugangsdaten bleibt die Seite verschlossen. Ein offener
  // Zugang waere hier schlimmer als gar keine Seite.
  if (!nutzer || !passwort) {
    return new Response('Übersicht ist nicht eingerichtet.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const abfrage = new Response('Zugang erforderlich.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Anfragen", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

  const kopf = request.headers.get('Authorization') || '';
  if (!kopf.startsWith('Basic ')) return abfrage;

  let entschluesselt;
  try {
    entschluesselt = new TextDecoder().decode(
      Uint8Array.from(atob(kopf.slice(6)), (c) => c.charCodeAt(0))
    );
  } catch (_) {
    return abfrage;
  }

  const trenner = entschluesselt.indexOf(':');
  if (trenner < 0) return abfrage;

  // Beide Vergleiche laufen immer, damit die Dauer nicht verrät, welcher
  // von beiden nicht gepasst hat.
  const nutzerOk = sicherGleich(entschluesselt.slice(0, trenner), nutzer);
  const passwortOk = sicherGleich(entschluesselt.slice(trenner + 1), passwort);
  if (!nutzerOk || !passwortOk) return abfrage;

  let zeilen = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT first_name, company, email, ads_budget, source, created_at
         FROM leads ORDER BY created_at DESC LIMIT 500`
    ).all();
    zeilen = results || [];
  } catch (err) {
    console.error('admin query failed', { message: err && err.message });
    return new Response('Abfrage fehlgeschlagen.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  return new Response(adminSeite(zeilen), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Kein Zwischenspeicher und keine Indexierung: Auf der Seite stehen
      // echte Kontaktdaten.
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const { pathname } = new URL(request.url);

    // Preflight zuerst – auch für unbekannte Pfade, sonst meldet der
    // Browser einen CORS-Fehler statt des eigentlichen 404.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Die Uebersicht liegt bewusst im Worker und nicht auf der Website:
    // GitHub Pages kennt keinen Passwortschutz, dort waere jede Datei
    // oeffentlich. Nur GET, und ohne CORS-Header - die Seite wird im
    // Browser aufgerufen, nicht von fremdem JavaScript.
    if (pathname === '/admin') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed.', { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      return admin(request, env);
    }

    if (pathname !== '/api/contact') {
      return fail(origin, 404, MESSAGES.notFound);
    }

    if (request.method !== 'POST') {
      return json({ success: false, error: MESSAGES.method }, 405, origin, {
        Allow: 'POST, OPTIONS',
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (_) {
      return fail(origin, 400, MESSAGES.validation);
    }

    // Honeypot: An dieses Feld kommt kein Mensch (siehe index.html). Bewusst
    // vor der Validierung – sonst bekäme ein Bot, der zusätzlich Pflichtfelder
    // falsch ausfüllt, eine 400 statt der stillen 201 und könnte daraus
    // ableiten, dass das versteckte Feld ausgewertet wird.
    if (str(payload && payload.website)) {
      // Nur die Herkunft, keine Eingaben – wie beim D1-Fehler weiter unten.
      // Macht sichtbar, ob der Honeypot je bei echtem Verkehr auslöst.
      console.log('honeypot rejected', { source: str(payload.source).slice(0, MAX_LENGTH.source) });
      return json({ success: true }, 201, origin);
    }

    const lead = validate(payload);
    if (!lead) return fail(origin, 400, MESSAGES.validation);

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    try {
      // Ausschließlich gebundene Parameter. Es wird an keiner Stelle
      // SQL aus Benutzereingaben zusammengesetzt.
      await env.DB.prepare(
        `INSERT INTO leads
           (id, first_name, company, email, ads_budget, privacy_accepted, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(id, lead.firstName, lead.company, lead.email, lead.adsBudget, 1, lead.source, createdAt)
        .run();
    } catch (err) {
      // Nur Fehlermeldung und ID – niemals Name, Firma, E-Mail oder der
      // gesamte Payload. Die ID erlaubt die Zuordnung, ohne dass
      // personenbezogene Daten in den Logs landen.
      console.error('D1 insert failed', { id, message: err && err.message });
      return fail(origin, 500, MESSAGES.server);
    }

    // Erst jetzt, nachdem der Datensatz sicher steht. waitUntil laesst die
    // Antwort sofort raus und den Versand im Hintergrund weiterlaufen: Der
    // Besucher wartet nicht auf Mailjet, und ein Ausfall dort kostet
    // hoechstens die Benachrichtigung, nie den Lead.
    ctx.waitUntil(notify(env, lead, createdAt, id));

    return json({ success: true }, 201, origin);
  },
};
