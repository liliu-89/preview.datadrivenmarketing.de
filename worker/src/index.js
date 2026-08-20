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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const { pathname } = new URL(request.url);

    // Preflight zuerst – auch für unbekannte Pfade, sonst meldet der
    // Browser einen CORS-Fehler statt des eigentlichen 404.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
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

    return json({ success: true }, 201, origin);
  },
};
