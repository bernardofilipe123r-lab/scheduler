#!/usr/bin/env python3
import os
import subprocess
import sys

# Ensure stdout is unbuffered for Railway logs
os.environ['PYTHONUNBUFFERED'] = '1'

# Get PORT from environment, default to 8000
port = os.getenv('PORT', '8000')

print(f"[start.py] Starting application...", flush=True)
print(f"[start.py] PORT={port}", flush=True)
print(f"[start.py] DATABASE_URL={'set' if os.getenv('DATABASE_URL') else 'NOT SET'}", flush=True)
print(f"[start.py] DEAPI_API_KEY={'set' if os.getenv('DEAPI_API_KEY') else 'NOT SET'}", flush=True)

# Start uvicorn with the correct port
cmd = [
    'uvicorn',
    'app.main:app',
    '--host', '0.0.0.0',
    '--port', port
]

print(f"[start.py] Running: {' '.join(cmd)}", flush=True)
sys.exit(subprocess.call(cmd))
