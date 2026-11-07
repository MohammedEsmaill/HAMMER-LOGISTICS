# HAMMER LOGISTICS

Customs clearance office management system.

| Path | Stack |
| --- | --- |
| `apps/api` | NestJS + Prisma + PostgreSQL |
| `apps/web` | React + Vite + Tailwind (Arabic, RTL) |
| `docs/erd.mmd` | Database ERD (Mermaid) |
| `docs/DEPLOY.md` | Deployment: Neon (database), Render (API), Vercel (web) — in Arabic |
| `docs/SHARE.md` | Run it on your machine and share it with a Cloudflare tunnel link — in Arabic |

## Run it locally

Requirements: Node 22, and Docker (for PostgreSQL) or any PostgreSQL 16.

```bash
# 1. the database (also creates hammer_logistics_test for the e2e tests)
docker compose up -d

# 2. the API
cd apps/api
cp .env.example .env
#    DATABASE_URL="postgresql://hammer:hammer@localhost:5432/hammer_logistics?schema=public"
#    JWT_ACCESS_SECRET / JWT_REFRESH_SECRET: two different values of `openssl rand -hex 32`
#    SEED_CEO_EMAIL / SEED_CEO_PASSWORD: the first CEO account (…@hammerline.com)
npm install                   # also runs prisma generate
npx prisma migrate deploy
npx prisma db seed            # roles, cash boxes, lookups, the CEO account
npm run start:dev             # http://localhost:3000/api

# 3. the web app (another terminal)
cd apps/web
npm install
npm run dev                   # http://localhost:5173 (forwards /api to :3000)
```

Sign in with the CEO account from the seed, then add employees, users and roles from the app.

## Tests

```bash
cd apps/api
npm run test:e2e   # runs against hammer_logistics_test: migrates, empties and seeds it first
npm test           # unit tests
```

Business rules that Prisma cannot express (CHECK constraints, partial unique indexes,
append-only triggers, the approval view) are in the SQL of `apps/api/prisma/migrations`.
