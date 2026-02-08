FROM node:22-slim AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/gateway/package.json ./packages/gateway/
COPY contracts/package.json ./contracts/
COPY packages/agent/package.json ./packages/agent/
COPY packages/dashboard/package.json ./packages/dashboard/
RUN npm install --workspaces --include-workspace-root

# Build shared package
COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
RUN npm run build --workspace=packages/shared

# Build gateway
COPY packages/gateway/ ./packages/gateway/
RUN npm run build --workspace=packages/gateway

# --- Production stage ---
FROM node:22-slim AS production

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/gateway/package.json ./packages/gateway/
COPY contracts/package.json ./contracts/
COPY packages/agent/package.json ./packages/agent/
COPY packages/dashboard/package.json ./packages/dashboard/
RUN npm install --workspaces --include-workspace-root --omit=dev

COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=base /app/packages/gateway/dist ./packages/gateway/dist

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "packages/gateway/dist/index.js"]
