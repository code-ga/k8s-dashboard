# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app

# --- Stage 1: Install Dependencies ---
FROM base AS deps
COPY package.json bun.lock ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm install --frozen-lockfile

# --- Stage 2: Build ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY frontend ./frontend

WORKDIR /app/frontend
RUN npm run build

# --- Stage 3: Production Runtime ---
FROM node:22-alpine AS runner
WORKDIR /app

RUN npm install -g http-server

COPY --from=builder /app/frontend/dist ./frontend/dist

EXPOSE 3000

CMD ["http-server", "frontend/dist", "-p", "3000", "--gzip"]
