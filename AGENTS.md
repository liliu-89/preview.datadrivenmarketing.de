# Agent Instructions

## Repository Identity

This is the preview repository for the DDM website. Production lives in a
separate repository: preview and production must never be treated as the
same environment. Production actions are not part of normal agent work.

## Technology Stack

- Static HTML and vanilla JavaScript
- Tailwind CSS v4 with npm
- Cloudflare Worker with D1/SQLite for the contact form
- Wrangler for Worker tooling
- Sharp/WebP asset generation

Use `package.json` as the source of truth for exact tool versions and
commands.

## Before Doing Work

Before changing anything, read the complete task and all applicable
repository rules; check Git status and the current branch; verify the task
scope and its Git permissions. Do not treat previous chat sessions as a
source of truth. Work only inside the explicit task scope.

## Branch Rules

Never perform normal agent work directly on `main`; use a dedicated task
branch. Do not change the `Maintenance` branch: it is a specially protected
emergency area. Never force-push. Push and merge are permitted only when a
task explicitly authorizes them.

## Build and Generated Files

`src/input.css` is built by Tailwind into `dist/output.css`. If a task
changes `src/input.css` and runs the build, `dist/output.css` must be
explicitly included in that task's scope. The same rule applies to WebP and
other asset generators: run them only when every generated output is
explicitly in scope. Build commands are not automatically safe.

## Analytics and Tracking Contract

The site is consent-first. The consent script, the Consent → GTM order,
Consent Mode, form tracking, `lead_submitted`, CTA attribution, and GTM
coupling are not incidental changes. `lead_submitted` and its downstream
GTM, analytics, and conversion meaning form a coupled contract. Semantic
changes require explicit approval. Do not duplicate analytics IDs here.

## Form and Worker Safety

Treat changes to form logic, the Worker, `wrangler.toml`, migrations, D1, and
lead processing as elevated-risk work requiring task-specific care or
approval. Do not retrieve, print, or alter real lead data unless a task
explicitly and permissibly requires it. Never write secrets to code or logs.

## SEO Contract

Preview remains `noindex, nofollow`; canonicals point to production.
Production SEO is partly transformed or generated during the production
deployment process. Changes to `<head>`, canonicals, structured data,
robots/sitemaps, or redirect logic need special review. Do not duplicate
production values unnecessarily.

## Production Safety

Without explicit approval, agents must not:

- run `deploy:prod`
- modify, push to, or merge the production repository
- deploy the production Worker or run production DB migrations
- change DNS/CNAME, secrets, or `Maintenance`

`scripts/deploy-prod.mjs` may be inspected, but must not be run as part of
normal tasks.

## Safety Levels

Global or higher-priority safety rules always take precedence.

### GREEN

Within an explicit task scope: body copy, presentational markup, safe local
documentation, explicitly scoped assets, and CSS with its necessary generated
outputs when those outputs are explicitly in scope.

### YELLOW

Special review or explicit approval: `<head>`, consent, tracking, form logic,
the Worker, D1/migrations, dependencies, redirects, structured data, preview
deployment, push, and merge.

### RED

Never perform autonomously: production deploys, production-repository writes,
production migrations, secrets, real lead data without an explicitly
permissible task, DNS/CNAME changes, `Maintenance` changes, or force-push.
