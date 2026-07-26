# wave ui — Next.js 16 (App Router, SSR). pnpm + standalone output.
#
# Replaces the placeholder Dockerfile (which only `echo`'d and exited).
# Runtime: `node server.js` on port 3000 (Next.js standalone entrypoint,
# reads HOSTNAME/PORT env — see next.config.mjs `output: 'standalone'`).
FROM node:20-alpine AS build
WORKDIR /app
ENV CI=1
# package.json declares packageManager: pnpm@10.34.5 — pin it via corepack.
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time (not
# runtime), so they must be present during `next build`. Passed as a build arg
# from the compose (${NEXT_PUBLIC_PRIVY_APP_ID}).
ARG NEXT_PUBLIC_PRIVY_APP_ID
ENV NEXT_PUBLIC_PRIVY_APP_ID=$NEXT_PUBLIC_PRIVY_APP_ID
# typescript.ignoreBuildErrors=true in next.config — build won't fail on TS errors.
RUN pnpm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# Standalone server + the two dirs it doesn't bundle (static assets, public).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1
CMD ["node", "server.js"]
