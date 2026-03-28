FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile 2>/dev/null || pnpm install --prod
COPY --from=builder /app/dist ./dist

RUN mkdir -p /data

ENV DB_PATH=/data/voting.db
ENV PORT=3456

EXPOSE 3456
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3456/health || exit 1

CMD ["node", "dist/index.js"]
