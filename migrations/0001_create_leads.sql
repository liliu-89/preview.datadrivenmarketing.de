-- Leads aus dem Kontaktformular der Website.
--
-- Die Spalten bilden die fünf Formularfelder ab, dazu Herkunft und
-- Zeitstempel. Bewusst nicht erfasst: IP-Adresse und User-Agent
-- (personenbezogen und für den Zweck nicht erforderlich) sowie die
-- Seiten-URL, deren Aussage bereits in `source` steckt.
--
-- `privacy_accepted` wird als 0/1 geführt, weil SQLite keinen
-- Boolean-Typ kennt. Der Worker schreibt nur 1 – ohne Einwilligung
-- kommt es gar nicht erst zum Insert.
--
-- `created_at` setzt der Worker als ISO-8601-Zeitstempel, nicht die
-- Datenbank: So ist der Wert unabhängig von der Zeitzone des
-- ausführenden Rechenzentrums.

CREATE TABLE IF NOT EXISTS leads (
    id                TEXT PRIMARY KEY,
    first_name        TEXT NOT NULL,
    company           TEXT NOT NULL,
    email             TEXT NOT NULL,
    ads_budget        TEXT,
    privacy_accepted  INTEGER NOT NULL DEFAULT 0,
    source            TEXT NOT NULL DEFAULT 'website',
    created_at        TEXT NOT NULL
);

-- Sortierung nach Eingang ist die häufigste Abfrage.
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- Nachschlagen einer Adresse, etwa bei einer Rückfrage oder einem
-- Löschverlangen.
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
