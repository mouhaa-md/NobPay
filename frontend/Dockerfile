# syntax=docker/dockerfile:1
# NobPay: one self-contained Node 22 image (Next.js "standalone" output). Data lives in the /data volume.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data
RUN groupadd --system nobpay && useradd --system --gid nobpay --home-dir /app nobpay \
 && mkdir /data && chown nobpay:nobpay /data
COPY --from=build --chown=nobpay:nobpay /app/.next/standalone ./
COPY --from=build --chown=nobpay:nobpay /app/.next/static ./.next/static
COPY --from=build --chown=nobpay:nobpay /app/public ./public
USER nobpay
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
