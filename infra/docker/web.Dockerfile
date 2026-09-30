# Web + API image (Next.js standalone output).
# Build from the repository root: docker build -f infra/docker/web.Dockerfile -t etare-web .
# NEXT_PUBLIC_* values are inlined at build time: pass them as build args per environment.
FROM node:22-alpine AS build
RUN npm install -g pnpm@11.19.0
WORKDIR /repo
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile --filter "@etare/web..." \
 && pnpm --filter @etare/web build

FROM node:22-alpine
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
# Server secrets (DATABASE_URL, ...) are injected at runtime from the vault, never baked in.
CMD ["node", "apps/web/server.js"]
