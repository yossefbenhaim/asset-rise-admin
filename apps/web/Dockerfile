FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=development

COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY apps/api/package*.json ./apps/api/
COPY packages/shared/package*.json ./packages/shared/
COPY tsconfig.base.json ./

RUN npm install --legacy-peer-deps

# Need API sources so the web app can resolve AppRouter type via tsconfig paths.
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web ./apps/web

RUN npm --workspace apps/web run build

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
