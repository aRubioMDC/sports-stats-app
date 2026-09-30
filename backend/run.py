#!/usr/bin/env python3
"""Simple startup script that configures paths and starts Uvicorn."""

import sys
import os
from pathlib import Path

# Add the current directory to Python path so 'app' module is found
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=False)
