FROM node:22-slim AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/dashboard/package.json ./packages/dashboard/
COPY packages/gateway/package.json ./packages/gateway/
COPY packages/agent/package.json ./packages/agent/
COPY contracts/package.json ./contracts/
RUN npm install --workspaces --include-workspace-root

# Build shared package
COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
RUN npm run build --workspace=packages/shared

# Build dashboard (NEXT_PUBLIC_ vars are baked in at build time)
COPY packages/dashboard/ ./packages/dashboard/
ARG NEXT_PUBLIC_GATEWAY_URL=http://localhost:3000
ARG NEXT_PUBLIC_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
ARG NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=
ARG NEXT_PUBLIC_EXPLORER_URL=https://coston2-explorer.flare.network

ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL
ENV NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=$NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS
ENV NEXT_PUBLIC_EXPLORER_URL=$NEXT_PUBLIC_EXPLORER_URL

RUN npm run build --workspace=packages/dashboard

# --- Production stage ---
FROM node:22-slim AS production

WORKDIR /app

# Copy Next.js standalone output
COPY --from=base /app/packages/dashboard/.next/standalone ./
COPY --from=base /app/packages/dashboard/.next/static ./packages/dashboard/.next/static
COPY --from=base /app/packages/dashboard/public ./packages/dashboard/public

ENV NODE_ENV=production
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

CMD ["node", "packages/dashboard/server.js"]
