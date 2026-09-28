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
and the Today screen, all persisted in Postgres and reachable from a
mobile-first PWA. See [`docs/NEXUS_ROADMAP.md`](docs/NEXUS_ROADMAP.md) for
what's built vs. what's next (Voice, Brain, Connectors, Life Modules,
Intelligence, Native).

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

Not yet wired to a hosting provider — the repo is structured so that
`apps/api` and `apps/web` can each be deployed independently (Render/Fly/Railway
for the API, Vercel or the same host for the Next.js app), with `DATABASE_URL`
pointing at a managed Postgres (Neon). CI currently runs install → lint →
typecheck → test → build and stops there; wiring an actual deploy step is a
deliberate next step once a hosting provider is chosen (spec §56: never
auto-deploy before a deployment target is configured).

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
