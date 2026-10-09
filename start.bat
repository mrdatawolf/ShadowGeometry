@echo off
setlocal

echo Shadow Geometry - local dev server
echo ===================================

REM Locate Python 3
python -c "import sys; sys.exit(0 if sys.version_info.major==3 else 1)" >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python 3 is required to serve this project.
    echo   Install it from https://www.python.org/
    echo   Make sure "Add python.exe to PATH" is checked during install.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo %%v

REM Run tests if Node.js is available
node --version >nul 2>&1
if errorlevel 1 (
    echo Note: Node.js not found -- skipping verify.cjs tests.
) else (
    for /f "tokens=*" %%v in ('node --version') do echo Node: %%v
    echo.
    echo Running verification tests...
    node --experimental-vm-modules verify.cjs
    if errorlevel 1 (
        echo.
        echo WARNING: Some checks failed. The page may still load, but geometry may be broken.
        echo Press any key to start the server anyway, or close this window to abort.
        pause >nul
    ) else (
        echo All checks passed.
    )
)

set PORT=8000
if not "%~1"=="" set PORT=%~1

echo.
echo Starting server at http://localhost:%PORT%/
echo The app needs internet access to load three.js from jsDelivr.
echo Press Ctrl+C to stop.
echo.

REM Open the browser (give the server a moment to start)
ping -n 2 127.0.0.1 >nul 2>&1
start "" "http://localhost:%PORT%/"

python serve.py %PORT%
pause
