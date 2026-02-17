FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Disable Python output buffering for Railway logs
ENV PYTHONUNBUFFERED=1

# Install system dependencies in smaller batches to avoid resource exhaustion
# First batch: essential build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Second batch: image processing libraries + node-canvas (Cairo/Pango)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg-dev \
    zlib1g-dev \
    libfreetype6-dev \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Third batch: ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Fourth batch: Node.js for React frontend build
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy frontend package files first for npm cache
COPY package*.json ./

# Install frontend dependencies
RUN npm ci --legacy-peer-deps

# Copy frontend source and config files for build
COPY src/ src/
COPY index.html .
COPY vite.config.ts .
COPY tsconfig.json .
COPY tsconfig.node.json .
COPY tailwind.config.js .
COPY postcss.config.js .

# Vite bakes env vars at build time — pass them as build args
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Build React frontend
RUN npm run build

# Copy application code (Python backend)
COPY app/ app/
COPY assets/ assets/
COPY scripts/ scripts/
COPY railway.json ./

# Create output directories
RUN mkdir -p output/videos output/thumbnails output/reels output/schedules output/posts

# Expose port (Railway will set PORT env var)
EXPOSE 8000

# Run uvicorn directly - PORT defaults to 8000 if not set
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
