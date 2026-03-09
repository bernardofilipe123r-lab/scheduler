## ═══════════════════════════════════════════════════════════════════════════
## Stage 1: Frontend build (Node.js — discarded after build)
## ═══════════════════════════════════════════════════════════════════════════
FROM node:20-slim AS frontend-build

WORKDIR /app

# Copy package manifests first for npm cache layer
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy frontend source + config
COPY public/ public/
COPY src/ src/
COPY index.html .
COPY vite.config.ts .
COPY tsconfig.json .
COPY tsconfig.node.json .
COPY tailwind.config.js .
COPY postcss.config.js .

# Vite bakes env vars at build time
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

## ═══════════════════════════════════════════════════════════════════════════
## Stage 2: Runtime (Python only — no Node.js, no build tools)
## ═══════════════════════════════════════════════════════════════════════════
FROM python:3.11-slim

WORKDIR /app

# Disable Python output buffering for Railway logs
ENV PYTHONUNBUFFERED=1

# System deps: image processing libs + ffmpeg + Node for carousel renderer
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    curl \
    libjpeg-dev \
    zlib1g-dev \
    libfreetype6-dev \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Node.js runtime needed for carousel renderer (scripts/render-slides.cjs)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy carousel renderer + its deps (needs canvas npm package at runtime)
COPY package*.json ./
RUN npm ci --legacy-peer-deps --omit=dev 2>/dev/null || npm ci --legacy-peer-deps

# Copy built frontend from stage 1
COPY --from=frontend-build /app/dist dist/

# Copy application code
COPY app/ app/
COPY assets/ assets/
COPY scripts/ scripts/
COPY railway.json ./

EXPOSE 8000

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
