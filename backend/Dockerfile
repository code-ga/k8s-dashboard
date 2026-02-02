# syntax=docker/dockerfile:1
FROM oven/bun:1 AS base
WORKDIR /app

# --- Stage 1: Install Dependencies ---
FROM base AS deps
# Copy package files for workspace resolution
COPY package.json bun.lock ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Use Docker Buildx cache mount for Bun's download cache
# This significantly speeds up subsequent builds
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# --- Stage 2: Production Runtime ---
FROM base AS runner
# Copy workspace node_modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy backend source and root package.json
# By only copying the backend folder, we ensure that changes in frontend/src
# do NOT invalidate the Docker cache for this stage.
COPY backend ./backend
COPY package.json ./

# Set working directory to the backend package
WORKDIR /app/backend

# Expose port and set production environment
EXPOSE 3001
ENV NODE_ENV=production

# Use the built-in 'bun' user for security
USER bun

# Run the application
CMD ["bun", "run", "src/index.ts"]
