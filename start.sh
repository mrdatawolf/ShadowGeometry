#!/usr/bin/env bash

# Locate Python 3
if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null && python -c "import sys; sys.exit(0 if sys.version_info.major==3 else 1)" 2>/dev/null; then
    PYTHON=python
else
    echo "ERROR: Python 3 is required to serve this project."
    echo "  Install it from https://www.python.org/ or via your package manager."
    exit 1
fi

echo "Python: $($PYTHON --version)"

# Run tests if Node.js is available
if command -v node &>/dev/null; then
    echo "Node:   $(node --version)"
    echo ""
    echo "Running verification tests..."
    if node --experimental-vm-modules verify.cjs; then
        echo "All checks passed."
    else
        echo ""
        echo "WARNING: Some checks failed. The page may still load, but geometry may be broken."
        echo "Press Enter to start the server anyway, or Ctrl+C to abort."
        read -r
    fi
else
    echo "Note:   Node.js not found — skipping verify.cjs tests."
fi

PORT=${1:-8000}

# Try to open a browser after the server starts (best-effort)
(sleep 1.5 && (xdg-open "http://localhost:$PORT/" 2>/dev/null || open "http://localhost:$PORT/" 2>/dev/null || true)) &

echo ""
echo "Starting server at http://localhost:$PORT/"
echo "The app needs internet access to load three.js from jsDelivr."
echo "Press Ctrl+C to stop."
echo ""

$PYTHON serve.py "$PORT"
