# NEXUS — Setup local

## Requisitos

- Node.js ≥ 20
- pnpm ≥ 10 (`corepack enable` lo instala si no lo tenés)
- PostgreSQL 16 corriendo localmente, o una connection string de Neon

## 1. Clonar e instalar

```bash
git clone <url-del-repo> Nexus
cd Nexus
pnpm install
```

## 2. Base de datos local (opción rápida con Postgres nativo)

```bash
# Crear usuario y bases (dev + test)
sudo -u postgres psql -c "CREATE USER nexus WITH PASSWORD 'nexus_dev_password' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE nexus_dev OWNER nexus;"
sudo -u postgres psql -c "CREATE DATABASE nexus_test OWNER nexus;"
```

(O usá una connection string de [Neon](https://neon.tech) directamente en
`DATABASE_URL` — no hace falta Postgres local si ya tenés un proyecto ahí.)

## 3. Variables de entorno

```bash
cp .env.example .env
```

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | Connection string de Postgres (`postgresql://user:pass@host:5432/db`) |
| `AUTH_SECRET` | String aleatorio largo para firmar los JWT. Generalo con `openssl rand -hex 32` |
| `AUTH_ACCESS_TOKEN_TTL` / `AUTH_REFRESH_TOKEN_TTL` | Duración de sesión (`15m`, `30d` por defecto) |
| `API_PORT` | Puerto del backend (4000 por defecto) |
| `API_CORS_ORIGINS` | Orígenes permitidos a llamar a la API (la URL del frontend) |
| `NEXT_PUBLIC_API_URL` | URL de la API que usa el frontend (debe ser accesible desde el navegador) |
| `AI_PROVIDER` / `AI_API_KEY` | Fase 3+, no se usan todavía |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Fase 4+, no se usan todavía |

## 4. Generar el cliente de Prisma y migrar

```bash
pnpm db:generate
pnpm db:migrate
```

## 5. Levantar todo

```bash
pnpm dev:api   # http://localhost:4000
pnpm dev:web   # http://localhost:3000, en otra terminal
```

Abrí `http://localhost:3000/register`, creá una cuenta, y ya estás en
`/today`.

## Comandos de calidad

```bash
pnpm lint        # eslint en api y web
pnpm typecheck   # tsc --noEmit en api y web
pnpm test        # vitest en api (contra nexus_test, no nexus_dev)
pnpm build       # build de producción de api y web
```

Los tests del API asumen `nexus_test` corriendo en
`postgresql://nexus:nexus_dev_password@localhost:5432/nexus_test`
(`apps/api/vitest.config.ts`) — son credenciales de desarrollo local, no
secretos reales, y nunca tocan `nexus_dev`.

## Prisma Studio (explorar datos)

```bash
pnpm db:studio
```
