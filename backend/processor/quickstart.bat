@echo off
REM Brain Shadow Enrichment - Quick Start Script (Windows)
REM This script sets up everything you need to get started

setlocal enabledelayedexpansion

echo.
echo 🚀 Brain Shadow Enrichment - Quick Start Setup
echo ==============================================
echo.

REM Check Node.js
echo ✓ Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js not found. Please install Node.js 18+
    echo    Download: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo   Version: !NODE_VERSION!
echo.

REM Check npm
echo ✓ Checking npm...
for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo   Version: !NPM_VERSION!
echo.

REM Install dependencies
echo ✓ Installing dependencies...
call npm install
if errorlevel 1 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)
echo   ✓ Dependencies installed
echo.

REM Setup .env
echo ✓ Setting up .env...
if not exist .env (
    copy .env.example .env >nul
    echo   ✓ Created .env from template
    echo   ⚠️  IMPORTANT: Edit .env and add your OpenRouter API key
    echo      Get key at: https://openrouter.ai/keys
) else (
    echo   ✓ .env already exists
)
echo.

REM Validate configuration
echo ✓ Validating configuration...
node -e "require('dotenv').config(); if (!process.env.OPENROUTER_API_KEY) { console.error('❌ OPENROUTER_API_KEY not set in .env'); process.exit(1); } console.log('  ✓ Configuration valid');"
if errorlevel 1 (
    echo.
    pause
    exit /b 1
)
echo.

REM Check input file
echo ✓ Checking input file...
if not exist input (
    mkdir input
    echo   ✓ Created input directory
)

dir /b input\*.json >nul 2>&1
if errorlevel 1 (
    echo   ⚠️  No input files found in .\input\
    echo      Place your brain-shadow-export-*.json file there
) else (
    echo   ✓ Input file(s) found
)
echo.

REM Create output directory
echo ✓ Creating output directory...
if not exist output mkdir output
if not exist logs mkdir logs
echo   ✓ Output directories ready
echo.

REM Validate code
echo ✓ Validating code...
call npm run validate >nul 2>&1
if errorlevel 1 (
    echo   ⚠️  Code validation warnings
) else (
    echo   ✓ Code validation passed
)
echo.

echo ==============================================
echo ✅ Setup Complete!
echo.
echo 📋 Next Steps:
echo.
echo 1. Edit your API key (if not already set):
echo    notepad .env
echo    # Set: OPENROUTER_API_KEY=your_key_here
echo.
echo 2. Add input data:
echo    # Place brain-shadow-export-*.json in .\input\
echo.
echo 3. Run enrichment:
echo    npm run enrich
echo.
echo 4. Check results:
echo    type output\enriched.json
echo.
echo 📚 Documentation:
echo    - README.md - Full documentation
echo    - SETUP.md - Detailed setup guide
echo.
echo 🔗 Useful Links:
echo    - OpenRouter Keys: https://openrouter.ai/keys
echo    - OpenRouter Models: https://openrouter.ai/models
echo.

pause
