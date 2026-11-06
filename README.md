# HAMMER LOGISTICS

Customs clearance office management system.

| Path | Stack |
| --- | --- |
| `apps/api` | NestJS + Prisma + PostgreSQL |
| `apps/web` | React + Vite + Tailwind (Arabic, RTL) |
| `docs/erd.mmd` | Database ERD (Mermaid) |

## Database

```bash
cd apps/api
cp .env.example .env   # set DATABASE_URL
npx prisma migrate dev
```

Business rules that Prisma cannot express (CHECK constraints, partial unique indexes,
the composite FK tying a shipment's factory to its client) are in
`apps/api/prisma/migrations/*_init/migration.sql`.
