#!/usr/bin/env python3
import os
import subprocess
import sys

# Get PORT from environment, default to 8000
port = os.getenv('PORT', '8000')

# Start uvicorn with the correct port
cmd = [
    'uvicorn',
    'app.main:app',
    '--host', '0.0.0.0',
    '--port', port
]

print(f"Starting Uvicorn on port {port}...")
sys.exit(subprocess.call(cmd))
