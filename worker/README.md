# DDM Lead-Endpunkt

Cloudflare Worker, der `POST /api/contact` entgegennimmt und nach D1 schreibt.
Quelltext: `src/index.js`. Schema: `../migrations/0001_create_leads.sql`.

Alle Kommandos laufen **aus dem Repository-Wurzelverzeichnis**.

## Einmalige Einrichtung

```bash
npx wrangler login

npx wrangler d1 create ddm-leads-preview --jurisdiction eu
npx wrangler d1 create ddm-leads-prod --jurisdiction eu
```

Die beiden ausgegebenen `database_id`-Werte ersetzen `PLATZHALTER_PREVIEW`
und `PLATZHALTER_PROD` in `wrangler.toml`.

```bash
npm run db:migrate:preview
npm run db:migrate:prod
```

## Deployen

```bash
npm run worker:deploy          # Preview
npm run worker:deploy:prod     # Production
```

Die beim ersten Deploy ausgegebene URL gehört in das Attribut
`data-endpoint` am `<form id="leadForm">` in `index.html`.

## Lokal entwickeln

```bash
npm run worker:dev             # Worker auf http://localhost:8787
```

Die lokale Datenbank braucht das Schema einmalig:

```bash
npx wrangler d1 execute ddm-leads-preview --local \
  --config worker/wrangler.toml --env preview \
  --file=./migrations/0001_create_leads.sql
```

Für einen Test gegen den lokalen Worker `data-endpoint` vorübergehend auf
`http://localhost:8787/api/contact` setzen. `http://localhost:4173` steht
bereits in der Origin-Allowlist.

## Prüfen

```bash
curl -i -X POST https://ddm-leads-preview.<subdomain>.workers.dev/api/contact \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","company":"Testfirma","email":"test@example.com","budget":"5-10k","consent":true,"source":"manual_test"}'
```

```bash
npm run db:list:preview
```

### Honeypot

Das Formular enthält ein für Menschen unerreichbares Feld `website` (siehe
`.honeypot` in `src/input.css`). Ist es befüllt, antwortet der Worker mit
`201 {"success":true}` und schreibt nichts in die Datenbank. Die Antwort ist
zeichengleich mit einer echten Annahme, damit ein Bot nicht erkennt, dass er
abgewiesen wurde.

Gegenprobe – muss `201` liefern, ohne dass ein Datensatz entsteht:

```bash
curl -i -X POST https://ddm-leads-preview.<subdomain>.workers.dev/api/contact \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Bot","company":"Spam","email":"bot@example.com","consent":true,"website":"http://spam.example"}'
```

## Logs

```bash
npx wrangler tail --config worker/wrangler.toml --env preview
```

Geloggt wird ausschließlich die Fehlermeldung plus Lead-ID. Weder Name noch
Firma, E-Mail oder Payload erscheinen in den Logs. Der Honeypot protokolliert
zusätzlich `honeypot rejected` mit der Herkunft, ebenfalls ohne Eingaben –
daran lässt sich ablesen, ob er je bei echtem Verkehr auslöst.
