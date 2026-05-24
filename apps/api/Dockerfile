FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
COPY packages/shared/package*.json ./packages/shared/
COPY tsconfig.base.json ./

RUN npm install --legacy-peer-deps --workspaces --include-workspace-root

COPY packages ./packages
COPY apps/api ./apps/api

WORKDIR /app/apps/api
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
# Run migrations on every boot (idempotent), then start.
CMD ["sh", "-c", "(npx tsx src/db/migrate.ts || echo 'migrate skipped') && npx tsx src/server.ts"]
