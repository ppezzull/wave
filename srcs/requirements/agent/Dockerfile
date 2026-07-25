# wave agent — Mastra HTTP server (Hono). `mastra build` produces a self-contained
# .mastra/output/ (server bundle + its own node_modules); the runtime stage copies
# it and runs `node index.mjs`. Secrets (ZAI_* keys) are injected at runtime via
# env_file — never baked into the image (see .dockerignore).
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build            # mastra build → .mastra/output/ (self-contained)

FROM node:20-alpine AS runtime
WORKDIR /app
# PORT must be set here (not just EXPOSE'd): the Mastra server defaults PORT to
# 4111 if unset → healthcheck on 3002 would always fail → container "unhealthy".
ENV NODE_ENV=production PORT=3002
# Self-contained: the build output carries its own node_modules + package.json.
COPY --from=build /app/.mastra/output ./
USER node                    # run as non-root
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1
CMD ["node", "index.mjs"]
