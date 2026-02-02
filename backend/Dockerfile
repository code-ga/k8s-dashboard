# syntax=docker/dockerfile:1
# NOTE: This Dockerfile MUST be built from the project ROOT (monorepo root)
# Command: docker build -t backend -f backend/Dockerfile .

FROM oven/bun:1 AS base
WORKDIR /app

# --- Stage 1: Install Dependencies ---
FROM base AS deps
# Copy all package.json files to resolve "catalog:" and workspaces
# Using a glob/multiple copy to ensure root and package files are present
COPY package.json bun.lock ../
COPY backend/package.json ../backend/
COPY frontend/package.json ../frontend/

# Use Docker Buildx cache mount for Bun's download cache
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# --- Stage 2: Production Runtime ---
FROM base AS runner
# Copy ONLY the node_modules needed for the workspace
COPY --from=deps /app/node_modules ./node_modules

# Copy the backend source and root package.json (for workspace context)
# We copy them specifically to avoid cache invalidation from other packages
COPY backend ../backend
COPY package.json ../

# Change to backend directory
WORKDIR /app/backend

# Environment setup
EXPOSE 3001
ENV NODE_ENV=production

# Security: Use non-root user
USER bun

# Run the application
CMD ["bun", "run", "src/index.ts"]


