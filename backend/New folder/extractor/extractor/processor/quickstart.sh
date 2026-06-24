#!/bin/bash

# Brain Shadow Enrichment - Quick Start Script
# This script sets up everything you need to get started

set -e  # Exit on error

echo "🚀 Brain Shadow Enrichment - Quick Start Setup"
echo "=============================================="
echo ""

# Check Node.js
echo "✓ Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+";
    echo "   Download: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node -v)
echo "  Version: $NODE_VERSION"
echo ""

# Check npm
echo "✓ Checking npm..."
NPM_VERSION=$(npm -v)
echo "  Version: $NPM_VERSION"
echo ""

# Install dependencies
echo "✓ Installing dependencies..."
npm install
echo "  ✓ Dependencies installed"
echo ""

# Setup .env
echo "✓ Setting up .env..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "  ✓ Created .env from template"
    echo "  ⚠️  IMPORTANT: Edit .env and add your OpenRouter API key"
    echo "     Get key at: https://openrouter.ai/keys"
else
    echo "  ✓ .env already exists"
fi
echo ""

# Validate configuration
echo "✓ Validating configuration..."
node -e "require('dotenv').config(); if (!process.env.OPENROUTER_API_KEY) { console.error('❌ OPENROUTER_API_KEY not set in .env'); process.exit(1); } console.log('  ✓ Configuration valid');"
echo ""

# Check input file
echo "✓ Checking input file..."
if [ ! -d ./input ]; then
    mkdir -p ./input
    echo "  ✓ Created input directory"
fi

if ls ./input/*.json 1> /dev/null 2>&1; then
    FILE_COUNT=$(ls -1 ./input/*.json | wc -l)
    echo "  ✓ Found $FILE_COUNT input file(s)"
else
    echo "  ⚠️  No input files found in ./input/"
    echo "     Place your brain-shadow-export-*.json file there"
fi
echo ""

# Create output directory
echo "✓ Creating output directory..."
mkdir -p ./output ./logs
echo "  ✓ Output directories ready"
echo ""

# Validate code
echo "✓ Validating code..."
npm run validate > /dev/null 2>&1 && echo "  ✓ Code validation passed" || echo "  ⚠️  Code validation warnings"
echo ""

echo "=============================================="
echo "✅ Setup Complete!"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Edit your API key (if not already set):"
echo "   nano .env"
echo "   # Set: OPENROUTER_API_KEY=your_key_here"
echo ""
echo "2. Add input data:"
echo "   # Place brain-shadow-export-*.json in ./input/"
echo ""
echo "3. Run enrichment:"
echo "   npm run enrich"
echo ""
echo "4. Check results:"
echo "   cat output/enriched.json"
echo ""
echo "📚 Documentation:"
echo "   - README.md - Full documentation"
echo "   - SETUP.md - Detailed setup guide"
echo ""
echo "🔗 Useful Links:"
echo "   - OpenRouter Keys: https://openrouter.ai/keys"
echo "   - OpenRouter Models: https://openrouter.ai/models"
echo ""
