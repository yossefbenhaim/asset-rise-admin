# Asset Rise Admin

Internal CRM / admin console for Silver Castle. Manages users, customer leads, buildings, and submissions — all from a single dashboard at **admin.byclick.co.il** (or wherever you deploy it).

## Architecture

Standalone monorepo. Shares the Silver Castle Supabase database (read access to `sc_profiles`, `sc_buildings`, `sc_submissions`, etc.), but otherwise has its own backend, frontend, deploy, and lifecycle.

```
asset-rise-admin/
├── apps/
│   ├── api/           Express + tRPC server (Node 20)
│   │   └── db/migrations/   admin role + sc_leads + permissions (additive)
│   └── web/           Vite + React + Tailwind CRM UI
├── packages/
│   └── shared/        zod schemas + TypeScript types
├── nginx/             nginx config baked into the web container
└── docker-compose.yml
```

## How an admin gets access

1. User signs up via Supabase OAuth on the admin login page (or already exists from Silver Castle).
2. Operator promotes them manually in the DB:

```sql
update sc_profiles set role = 'admin' where email = 'someone@example.com';
delete from sc_tenant_profiles where id = (select id from sc_profiles where email = 'someone@example.com');
insert into sc_admin_profiles (id, is_admin, is_admin_support, is_admin_sales)
values ((select id from sc_profiles where email = 'someone@example.com'), true, false, false);
```

3. They can now log into the admin app.

## Local dev

```bash
npm install
cp .env.example apps/api/.env   # then fill in SUPABASE_SERVICE_ROLE_KEY + SUPABASE_DB_URL
npm run migrate                 # applies db/migrations/* to the shared Supabase
npm run dev:api                 # http://localhost:3000
npm run dev:web                 # http://localhost:5173
```

## Deploy

`docker compose up -d --build` — same Coolify / Traefik pattern as the rest of the byclick stack.
