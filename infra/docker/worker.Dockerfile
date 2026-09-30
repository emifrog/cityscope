# Worker image: the bundle (dist/main.js) only needs its npm runtime dependencies (pg, zod).
# Build from the repository root: docker build -f infra/docker/worker.Dockerfile -t etare-worker .
FROM node:22-alpine AS build
RUN npm install -g pnpm@11.19.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@etare/worker..." \
 && pnpm --filter @etare/worker build \
 && pnpm --filter @etare/worker deploy --legacy --prod /out

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/services/worker/dist ./dist
USER node
# Configuration comes from the environment (WORKER_DATABASE_URL, ...), never from the image.
CMD ["node", "dist/main.js"]
