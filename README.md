# NEXUS

**Personal AI Operating System.**

NEXUS is not a to-do app with a chatbot bolted on. It's meant to become the
single point of contact between you and the rest of your digital life —
tasks, projects, calendar, finances, training, food, travel, documents,
communications — organized by an AI orchestrator (**NexusBrain**) instead of
by you switching between a dozen apps.

> "Voy a abrir Calendar." "Voy a abrir Gmail." "Voy a abrir mis notas."
> No — **se lo decís a NEXUS**, y NEXUS decide qué herramienta usar.

This repository is the official source of truth for NEXUS. See
[`docs/NEXUS_MASTER_ARCHITECTURE.md`](docs/NEXUS_MASTER_ARCHITECTURE.md) for
the full product/technical answer this project was designed against.

## Current status

**Phase 1 — NEXUS Core** is implemented and tested end-to-end: accounts,
areas, projects, tasks, calendar events, reminders, inbox / quick capture,
the Today screen (redesigned as a HUD console around the **Nexus Face**),
synced preferences, and a first-run onboarding tour — all persisted in
Postgres and reachable from a mobile-first PWA. See
[`docs/NEXUS_ROADMAP.md`](docs/NEXUS_ROADMAP.md) for what's built vs.
what's next (Voice is next up, then Brain, Connectors — including a
NEXUS Home smart-home connector — Life Modules, Intelligence, Native).

## Architecture

Monorepo, pnpm workspaces. Frontend and backend are independent services
talking over a JSON API — the API has no knowledge of any particular
client, so a native iOS/Windows client can replace or sit alongside the PWA
later without touching it.

```
Nexus/
  apps/
    web/          Next.js 15 PWA (mobile-first, installable) — the client
    api/           Express + TypeScript API — the backend, owns all business logic
  packages/
    shared/        Zod schemas + TS types shared by web and api (the API contract)
  database/
    schema.prisma  Single source of truth for the data model
    migrations/    Generated Prisma migrations
  docs/            Architecture, schema, security, UI, roadmap docs (this list, kept in sync)
  .github/workflows/  CI (install → lint → typecheck → test → build)
```

`packages/nexus-brain`, `nexus-memory`, `nexus-tools`, and
`nexus-connectors` are designed (see the AI/Connectors docs) but not yet
scaffolded as empty folders — they land with Phase 3/4 when there's real
code to put in them (spec §58: no folders that exist only to look like
architecture).

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router) + React 19 + Tailwind | SSR-capable PWA, ships to iPhone home screen today, migrates cleanly to React Native later (see UI doc) |
| Backend | Express + TypeScript, ESM | Small, explicit, no framework magic — easy for NexusBrain to sit in front of later |
| Database | PostgreSQL via Prisma | Relational integrity for a graph of tasks/projects/people; Neon is the preferred managed host |
| Auth | Custom JWT (access + refresh) in httpOnly cookies, bcrypt | No third-party auth dependency; full control over session/device model |
| Validation | Zod, shared between client and server | One schema defines both the wire contract and the UI form validation |
| AI | Provider-agnostic `NexusAIProvider` interface (Phase 3) | Never locks the product to one LLM vendor |

## Repository structure & local development

### Prerequisites

- Node.js ≥ 20, pnpm ≥ 10 (`corepack enable` will install it)
- A PostgreSQL 16 instance (local or Neon)

### Install

```bash
pnpm install
```

### Environment variables

Copy `.env.example` to `.env` and fill in real values. Never commit `.env`.

```bash
cp .env.example .env
```

See [`docs/NEXUS_SETUP.md`](docs/NEXUS_SETUP.md) for what each variable does
and how to get a local Postgres running.

### Database

```bash
pnpm db:generate   # generate the Prisma client
pnpm db:migrate     # create/apply migrations against DATABASE_URL
```

### Run it

```bash
pnpm dev:api   # http://localhost:4000
pnpm dev:web   # http://localhost:3000
```

### Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All four run in CI on every push (see `.github/workflows/ci.yml`).

## Deployment

**GitHub Pages can't run this** — it only serves static files, and NEXUS
needs a live Node process (the API) and a real database. There's no way
around that; it's not a configuration issue.

### One-click deploy (Render)

[`render.yaml`](render.yaml) is a Render Blueprint that provisions
everything from one account: a free Postgres database and one web service
running both the API and the Next.js app together (see
[`scripts/render-start.sh`](scripts/render-start.sh) for why they're one
process — it also sidesteps a real footgun: api and web on two different
subdomains of a shared platform domain, e.g. `*.onrender.com`, are
different *sites* for cookie purposes on most PaaS providers, which
silently breaks cookie-based login).

1. Push this repo to your own GitHub account (already done if you're
   reading this from your fork/copy).
2. On [render.com](https://render.com), **New +** → **Blueprint** → pick
   the repo. Render reads `render.yaml` and creates the database and the
   service by itself — nothing to wire by hand.
3. Open the new service once it's up, click through to its URL. That's
   the whole app, live.
4. Optional: in the service's Environment tab, set `AI_API_KEY` (an
   Anthropic key from [console.anthropic.com](https://console.anthropic.com))
   for the AI-generated Today insight — works fine without it too.

Free tier: the service sleeps after 15 minutes idle (~30-60s to wake on
the next request), and the free Postgres database expires after 90 days.
Fine for trying it out; move to a paid plan for anything longer-lived.

*(I built and verified this Blueprint's logic by running the exact same
build and start commands locally against a throwaway database — including
the cookie/proxy behavior end-to-end in a real browser — but couldn't
click through an actual Render deploy from this session, since this
environment's network policy blocks render.com outright. If Render's
blueprint UI flags a field when you deploy it, paste me the error and
I'll fix it immediately.)*

### Other hosts

`apps/api` and `apps/web` can also be deployed as two independent
services on any Node host (Fly, Railway, etc.) with a managed Postgres
(Neon is the preferred provider) — set `DATABASE_URL` on the API and
`BACKEND_INTERNAL_URL` on the web app to the API's URL. Doing that across
two different domains (not subdomains of one PaaS domain) avoids the
cookie issue above, since two unrelated domains are already "cross-site"
in a way your auth flow would need to handle explicitly (or you'd add a
proper cross-site cookie configuration) — the single-service Render setup
above remains the simplest path.

CI runs install → lint → typecheck → test → build on every push (see
`.github/workflows/ci.yml`); it doesn't deploy automatically yet.

## Documentation

- [`docs/NEXUS_MASTER_ARCHITECTURE.md`](docs/NEXUS_MASTER_ARCHITECTURE.md) — the full architecture answer
- [`docs/NEXUS_DATABASE_SCHEMA.md`](docs/NEXUS_DATABASE_SCHEMA.md)
- [`docs/NEXUS_AI_ARCHITECTURE.md`](docs/NEXUS_AI_ARCHITECTURE.md)
- [`docs/NEXUS_CONNECTORS.md`](docs/NEXUS_CONNECTORS.md)
- [`docs/NEXUS_SECURITY.md`](docs/NEXUS_SECURITY.md)
- [`docs/NEXUS_UI_SYSTEM.md`](docs/NEXUS_UI_SYSTEM.md)
- [`docs/NEXUS_ROADMAP.md`](docs/NEXUS_ROADMAP.md)
- [`docs/NEXUS_SETUP.md`](docs/NEXUS_SETUP.md)
- [`docs/NEXUS_TEST_REPORT.md`](docs/NEXUS_TEST_REPORT.md)
