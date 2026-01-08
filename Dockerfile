FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for Pillow and other packages
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libjpeg-dev \
    zlib1g-dev \
    libfreetype6-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Make start script executable
RUN chmod +x start.py

# Create output directories
RUN mkdir -p output/videos output/thumbnails output/reels output/schedules

# Expose port (Railway will set PORT env var)
EXPOSE 8000

# Run the application using Python script to handle PORT variable correctly
CMD ["python3", "start.py"]
