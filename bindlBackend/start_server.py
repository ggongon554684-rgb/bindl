#!/usr/bin/env python
"""Start uvicorn server with proper path setup"""
import os
import sys

# Ensure we're in the right directory
os.chdir(r'c:\Users\gabgab8608\Documents\acads\gab\bindl\bindlBackend')
sys.path.insert(0, os.getcwd())

print(f"Working directory: {os.getcwd()}")
print(f"Python path[0]: {sys.path[0]}")

# Import and run uvicorn
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=False,
    )
