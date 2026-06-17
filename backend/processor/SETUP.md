# Brain Shadow Enrichment - Complete Setup & Deployment Guide

## 📋 Complete Deliverables Checklist

This document covers all 10 deliverables requested:

1. ✅ **Recommended folder structure** - See `Project Structure` section
2. ✅ **Complete implementation plan** - See `Implementation Plan` section
3. ✅ **Required npm packages** - See `npm Packages` section
4. ✅ **.env configuration** - See `.env Configuration` section & `.env.example` file
5. ✅ **OpenRouter integration code** - See `openrouter-client.js`
6. ✅ **enrich.js implementation** - See `enrich.js` (main script)
7. ✅ **JSON parsing and validation logic** - See `validators.js`
8. ✅ **Example input JSON** - See `example-input.json`
9. ✅ **Example enriched output JSON** - See `example-output.json`
10. ✅ **Production-ready best practices** - See sections below

---

## 1️⃣ Recommended Folder Structure

```
extractor/
├── processor/                          ← All enrichment code here
│   ├── enrich.js                       ← Main entry point (NOW UPDATED)
│   ├── config.js                       ← Configuration management
│   ├── openrouter-client.js            ← OpenRouter API client
│   ├── validators.js                   ← JSON validation & parsing
│   ├── package.json                    ← Dependencies
│   ├── .env                            ← Secrets (DO NOT COMMIT)
│   ├── .env.example                    ← Template
│   ├── README.md                       ← Documentation
│   ├── SETUP.md                        ← This file
│   │
│   ├── input/
│   │   └── brain-shadow-export-*.json  ← Your exported conversations
│   │
│   ├── output/
│   │   └── enriched.json               ← Enriched output (auto-generated)
│   │
│   └── logs/
│       └── enrichment-*.log            ← Processing logs (auto-generated)
│
├── content/
├── popup/
├── manifest.json
└── background.js
```

---

## 2️⃣ Complete Implementation Plan

### Phase 1: Local Development (30 mins)

```
Step 1: Initialize Node.js project
  ├─ npm init -y
  ├─ npm install openai dotenv
  └─ Verify node_modules created

Step 2: Create configuration files
  ├─ config.js - Load environment variables
  ├─ .env.example - Template configuration
  └─ Validate all config paths

Step 3: Implement OpenRouter client
  ├─ OpenRouterClient class
  ├─ Rate limiting logic
  ├─ Retry mechanism (exponential backoff)
  └─ Error handling

Step 4: Implement validators
  ├─ JSON schema validation
  ├─ Response parsing
  ├─ Text cleaning
  └─ Error messaging

Step 5: Create main enrich script
  ├─ File I/O operations
  ├─ Conversation processing loop
  ├─ Progress tracking
  ├─ Statistics generation
  └─ Log file creation
```

### Phase 2: Configuration & Testing (15 mins)

```
Step 1: Setup environment
  ├─ cp .env.example .env
  ├─ Get OpenRouter API key
  ├─ Add API key to .env
  └─ Verify configuration

Step 2: Test with example data
  ├─ Use example-input.json
  ├─ Run: npm run enrich
  ├─ Check output/enriched.json
  ├─ Compare with example-output.json
  └─ Verify metadata quality

Step 3: Monitor processing
  ├─ Check console output
  ├─ Review logs/enrichment-*.log
  ├─ Verify success rate
  └─ Check for errors
```

### Phase 3: Production Deployment (15 mins)

```
Step 1: Optimize configuration
  ├─ Adjust RATE_LIMIT_PER_MINUTE
  ├─ Set LOG_LEVEL to 'info'
  ├─ Enable LOG_TO_FILE
  └─ Test with full dataset

Step 2: Run full enrichment
  ├─ npm run enrich
  ├─ Monitor progress
  ├─ Allow to complete
  └─ Review summary

Step 3: Verify output
  ├─ Check output/enriched.json size
  ├─ Validate JSON structure
  ├─ Review metadata samples
  ├─ Check logs for errors
  └─ Backup enriched data

Step 4: Schedule automation (optional)
  ├─ Setup cron job or CI/CD
  ├─ Configure automatic runs
  ├─ Setup notifications
  └─ Monitor usage
```

---

## 3️⃣ Required npm Packages

### Core Dependencies

```json
{
  "dependencies": {
    "openai": "^4.52.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "eslint": "^9.0.0"
  }
}
```

### Why These?

- **openai** - OpenAI SDK (works with OpenRouter API)
  - Handles HTTP requests to OpenRouter
  - Manages authentication
  - Provides structured responses
  - Built-in error handling

- **dotenv** - Environment variable management
  - Loads .env file
  - Prevents hardcoded secrets
  - Supports production configs

- **eslint** - Code quality (optional)
  - Linting and validation
  - Code style consistency

### Installation

```bash
cd processor
npm install
```

---

## 4️⃣ .env Configuration

### Location

```
processor/
├── .env              ← YOUR SECRET FILE (DO NOT COMMIT)
└── .env.example      ← TEMPLATE (safe to commit)
```

### Setup Steps

1. **Copy template**
   ```bash
   cp .env.example .env
   ```

2. **Get OpenRouter API key**
   - Visit: https://openrouter.ai/keys
   - Sign up (free)
   - Generate new key
   - Copy key

3. **Edit .env**
   ```env
   OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxxxxxxxxx
   OPENROUTER_MODEL=meta-llama/llama-3.1-70b-instruct
   OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
   
   MAX_RETRIES=3
   RETRY_DELAY_MS=1000
   RATE_LIMIT_PER_MINUTE=20
   BATCH_SIZE=5
   REQUEST_TIMEOUT_MS=30000
   
   LOG_LEVEL=info
   LOG_TO_FILE=true
   LOG_DIR=./logs
   
   INPUT_DIR=./input
   OUTPUT_DIR=./output
   INPUT_FILE=brain-shadow-export-2026-06-16.json
   OUTPUT_FILE=enriched.json
   ```

4. **Add to .gitignore**
   ```bash
   echo ".env" >> ../.gitignore
   ```

5. **Verify**
   ```bash
   node -e "require('dotenv').config(); console.log('API Key loaded:', process.env.OPENROUTER_API_KEY ? '✓' : '✗')"
   ```

### Configuration Reference

| Setting | Value | Notes |
|---------|-------|-------|
| `OPENROUTER_API_KEY` | Required | Get from OpenRouter dashboard |
| `OPENROUTER_MODEL` | `meta-llama/llama-3.1-70b-instruct` | Free, open-source model |
| `MAX_RETRIES` | `3` | Increase for unstable connections |
| `RETRY_DELAY_MS` | `1000` | Increase for rate limit issues |
| `RATE_LIMIT_PER_MINUTE` | `20` | Check OpenRouter quota |
| `REQUEST_TIMEOUT_MS` | `30000` | 30s timeout for responses |
| `LOG_TO_FILE` | `true` | Enable detailed logs |

---

## 5️⃣ OpenRouter Integration Code

### Overview

**File**: `openrouter-client.js`

**Purpose**: Handles all OpenRouter API communication

### Key Features

```javascript
class OpenRouterClient {
  // Rate limiting - prevents hitting API limits
  enforceRateLimit()
  
  // Retry logic - recovers from transient failures
  calculateBackoff(attempt)
  
  // Main method - extract metadata
  extractMetadata(conversationText, options)
  
  // Batch processing - efficient multi-conversation enrichment
  batchExtractMetadata(conversations, onProgress)
}
```

### API Flow

```
1. User calls: client.extractMetadata(conversationText)
   ↓
2. Rate limiting check: Wait if needed
   ↓
3. Send request to OpenRouter API
   ↓
4. On error: Retry with exponential backoff
   ↓
5. Parse response: Extract metadata JSON
   ↓
6. Return: { success, metadata, tokens }
```

### Retry Strategy

```
Attempt 1: Immediate
Attempt 2: Wait 1000ms
Attempt 3: Wait 1500ms (1000 * 1.5^1)
Attempt 4: Wait 2250ms (1000 * 1.5^2)
...capped at 30000ms
```

---

## 6️⃣ enrich.js Implementation

### Overview

**File**: `enrich.js` (MAIN SCRIPT - UPDATED)

**Purpose**: Orchestrates entire enrichment workflow

### Core Functions

```javascript
ensureOutputDirectories()      // Create output folders
loadInputData()                // Load and validate input JSON
extractConversationText()      // Extract and clean text
processMetadataResponse()      // Parse and validate response
enrichConversation()           // Attach metadata to conversation
saveEnrichedData()            // Write output JSON
generateSummary()             // Create statistics
saveLog()                     // Log detailed results
main()                        // Main workflow
```

### Workflow

```
┌─────────────────────────────────┐
│  Start enrichment.js            │
├─────────────────────────────────┤
│ 1. Create output directories    │
│ 2. Load input JSON              │
│ 3. Initialize OpenRouter client │
│ 4. For each conversation:       │
│    ├─ Extract text              │
│    ├─ Call API                  │
│    ├─ Parse response            │
│    ├─ Validate metadata         │
│    ├─ Attach metadata           │
│    └─ Handle errors             │
│ 5. Combine results              │
│ 6. Save output JSON             │
│ 7. Generate statistics          │
│ 8. Save logs                    │
│ 9. Display summary              │
└─────────────────────────────────┘
```

### Usage

```bash
# Run enrichment
npm run enrich

# With verbose logging
npm run enrich:verbose

# Validate code
npm run validate
```

---

## 7️⃣ JSON Parsing and Validation Logic

### Overview

**File**: `validators.js`

**Purpose**: Ensures data integrity and correctness

### Validation Schema

```javascript
METADATA_SCHEMA = {
  topic: { type: string, length: 1-200 },
  category: { type: string, enum: [...] },
  summary: { type: string, length: 10-1000 },
  keywords: { type: array, items: 1-20, itemLength: 1-100 },
  entities: { type: array, items: 0-30, itemLength: 1-100 },
  importance_score: { type: number, min: 1, max: 5, integer: true }
}
```

### Key Functions

```javascript
// Validate metadata object
validateMetadata(metadata) 
→ { valid: boolean, errors: string[] }

// Parse JSON from API response (handles markdown)
parseJsonResponse(text)
→ { parsed JSON object }

// Clean conversation text
cleanConversationText(text)
→ { normalized, clean text }
```

### Validation Example

```javascript
const metadata = {
  topic: "Docker and Node.js",
  category: "Technical",
  summary: "...",
  keywords: ["docker", "nodejs"],
  entities: ["Docker", "Node.js"],
  importance_score: 4
};

const result = validateMetadata(metadata);
// result.valid === true
// result.errors === []
```

---

## 8️⃣ Example Input JSON

**File**: `example-input.json`

Sample conversation export from Brain Shadow:

```json
{
  "exported_at": "2026-06-16T03:38:01.891Z",
  "meta": {
    "total_conversations": 2,
    "total_messages": 8
  },
  "conversations": [
    {
      "title": "Docker and Node.js Containerization Guide",
      "platform": "chatgpt",
      "message_count": 4,
      "messages": [
        {
          "role": "user",
          "content": "How do I containerize a Node.js app?",
          "timestamp": "2026-06-16T03:37:01.993Z"
        },
        {
          "role": "assistant",
          "content": "Create a Dockerfile...",
          "timestamp": "2026-06-16T03:37:02.993Z"
        }
      ]
    }
  ]
}
```

**Key Requirements**:
- Must have `conversations` array
- Each conversation must have `messages` array
- Each message must have `role` and `content`
- Timestamps should be ISO 8601 format

---

## 9️⃣ Example Enriched Output JSON

**File**: `example-output.json`

Same structure as input, but with `metadata` added:

```json
{
  "exported_at": "2026-06-16T03:38:01.891Z",
  "enrichment_metadata": {
    "enriched_at": "2026-06-16T10:42:33.521Z",
    "enrichment_version": "1.0.0"
  },
  "conversations": [
    {
      "title": "Docker and Node.js Containerization Guide",
      "platform": "chatgpt",
      "messages": [...],
      "metadata": {
        "enriched_at": "2026-06-16T10:42:33.500Z",
        "enrichment_version": "1.0.0",
        "topic": "Node.js Application Containerization with Docker",
        "category": "Technical",
        "summary": "Comprehensive guide on containerizing Node.js applications...",
        "keywords": [
          "Docker", "containerization", "Node.js", "Dockerfile",
          "Docker Compose", "npm", "deployment"
        ],
        "entities": [
          "Docker", "Node.js", "Docker Compose", "Kubernetes", "npm"
        ],
        "importance_score": 4
      }
    }
  ]
}
```

---

## 🔟 Production-Ready Best Practices

### 1. Security

#### API Key Management
```bash
# ✅ DO THIS
export OPENROUTER_API_KEY="your-key"
echo ".env" >> .gitignore

# ❌ DON'T DO THIS
OPENROUTER_API_KEY = "key" in code
Commit .env file
Hardcode secrets
```

#### Key Rotation
```bash
# Rotate every 30-60 days
# Generate new key: https://openrouter.ai/keys
# Update .env
# Delete old key
```

### 2. Error Handling

#### Handle Gracefully
```javascript
try {
  // API call
} catch (error) {
  // Log detailed error
  logger.error(`Specific error: ${error.message}`);
  
  // Preserve data
  // Continue processing other conversations
  
  // Return with original data (no metadata)
}
```

#### Retry Logic
```javascript
for (let attempt = 0; attempt <= maxRetries; attempt++) {
  try {
    return await apiCall();
  } catch (error) {
    if (isLastAttempt) throw error;
    await sleep(calculateBackoff(attempt));
  }
}
```

### 3. Rate Limiting

#### Respect API Quotas
```javascript
// Check rate limit before each request
await enforceRateLimit();

// Spread requests over time
const minDelay = (60 * 1000) / config.rateLimit.perMinute;
await sleep(minDelay);

// Monitor usage
console.log(`Requests: ${requestCount}/${maxPerMinute}`);
```

#### Configure Appropriately
```env
# Conservative: Safe for free tier
RATE_LIMIT_PER_MINUTE=10

# Moderate: Balanced
RATE_LIMIT_PER_MINUTE=20

# Aggressive: For paid tier
RATE_LIMIT_PER_MINUTE=60
```

### 4. Data Quality

#### Validate All Input
```javascript
// ✅ Validate schema
const validation = validateMetadata(metadata);
if (!validation.valid) {
  throw new Error(`Invalid metadata: ${validation.errors}`);
}

// ✅ Validate structure
if (!data.conversations || !Array.isArray(data.conversations)) {
  throw new Error('Invalid input structure');
}

// ✅ Handle edge cases
if (text.trim().length === 0) {
  logger.warn('Skipped empty conversation');
  return originalConversation; // Without metadata
}
```

#### Ensure Output Integrity
```javascript
// ✅ Pretty print JSON
JSON.stringify(data, null, 2);

// ✅ Include metadata
metadata.enriched_at = new Date().toISOString();
metadata.enrichment_version = '1.0.0';

// ✅ Backup before overwriting
fs.copyFileSync(outputPath, outputPath + '.backup');
```

### 5. Logging

#### Structured Logging
```javascript
logger.info('Starting process');           // Info level
logger.success('Completed');               // Success indicator
logger.warn('Skipped conversation');       // Warning
logger.error('API failed');                // Error
```

#### Save Logs
```javascript
// Create logs/ directory
fs.mkdirSync('./logs', { recursive: true });

// Save with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(`./logs/enrichment-${timestamp}.log`, logData);
```

#### Monitor Progress
```javascript
// Show progress during processing
logger.info(`[${i+1}/${total}] Processing: ${title}`);

// Display summary at end
logger.success(`Enriched: ${successful}/${total}`);
```

### 6. Performance Optimization

#### Batch Processing
```javascript
// Process in parallel batches
const batchSize = 5;
for (let i = 0; i < conversations.length; i += batchSize) {
  const batch = conversations.slice(i, i + batchSize);
  await Promise.all(batch.map(enrich));
}
```

#### Monitor Token Usage
```javascript
// Track API costs
let totalTokens = 0;
results.forEach(r => {
  totalTokens += r.tokens.input + r.tokens.output;
});
console.log(`Total tokens: ${totalTokens}`);
```

#### Optimize Text Cleaning
```javascript
// Cap text length to avoid token limits
const MAX_LENGTH = 8000;
return text.substring(0, MAX_LENGTH);

// Remove unnecessary whitespace
return text.replace(/\s+/g, ' ').trim();
```

### 7. Testing

#### Test with Example Data
```bash
# Use example-input.json
cp example-input.json input/test-input.json
npm run enrich

# Compare with example-output.json
diff output/enriched.json example-output.json
```

#### Test Error Scenarios
```javascript
// Test empty conversation
// Test very long conversation
// Test malformed JSON
// Test API timeout
// Test rate limit
```

### 8. Deployment

#### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
ENV NODE_ENV=production
CMD ["node", "enrich.js"]
```

#### CI/CD (GitHub Actions)
```yaml
name: Enrich Conversations
on: [push]
jobs:
  enrich:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm ci
      - run: npm run enrich
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

#### Scheduled Cron
```bash
# /etc/cron.d/enrich-conversations
0 2 * * * cd /opt/brain-shadow/processor && npm run enrich
```

### 9. Monitoring

#### Track Success Metrics
```javascript
// Success rate
const rate = (successful / total) * 100;
console.log(`Success Rate: ${rate.toFixed(2)}%`);

// Distribution analysis
categoriesBreakdown.forEach(([cat, count]) => {
  console.log(`${cat}: ${count}`);
});
```

#### Alert on Failures
```javascript
// Log failures for monitoring
if (failedEnrichments > 0) {
  logger.warn(`${failedEnrichments} enrichments failed`);
  sendAlert(`Enrichment errors detected: ${failedEnrichments}`);
}
```

### 10. Documentation

#### Comment Code
```javascript
/**
 * Extract metadata from conversation
 * @param {string} text - Conversation text
 * @returns {Promise<Object>} Metadata
 * @throws {Error} On API failure
 */
async function extractMetadata(text) { ... }
```

#### Maintain README
```markdown
# Brain Shadow Enrichment
- Features
- Installation
- Usage
- Configuration
- Troubleshooting
```

#### Track Changes
```bash
git log --oneline
git tag v1.0.0
```

---

## 🚀 Quick Start Command Guide

```bash
# Install
cd processor && npm install

# Configure
cp .env.example .env
# Edit .env with your API key

# Test
npm run enrich

# Validate
npm run validate

# Monitor
tail -f logs/enrichment-*.log

# Backup
cp output/enriched.json output/enriched.json.backup
```

---

## 📚 Files Created/Updated

### New Files Created
- ✅ `config.js` - Configuration management
- ✅ `openrouter-client.js` - OpenRouter API client
- ✅ `validators.js` - JSON validation
- ✅ `package.json` - Dependencies
- ✅ `.env.example` - Configuration template
- ✅ `example-input.json` - Sample input
- ✅ `example-output.json` - Sample output
- ✅ `README.md` - Full documentation
- ✅ `SETUP.md` - This setup guide

### Updated Files
- ✅ `enrich.js` - Complete rewrite with OpenRouter integration

---

## ✅ Verification Checklist

Before running enrichment:

- [ ] Node.js v18+ installed: `node --version`
- [ ] npm dependencies installed: `npm list`
- [ ] .env file created: `ls -la .env`
- [ ] OpenRouter API key valid: `grep OPENROUTER_API_KEY .env`
- [ ] Input JSON exists: `ls -la input/`
- [ ] Output directory writable: `touch output/.test`
- [ ] Config loads correctly: `node -e "require('./config.js')"`

After enrichment completes:

- [ ] enriched.json created: `ls -la output/enriched.json`
- [ ] JSON is valid: `node -e "JSON.parse(require('fs').readFileSync('./output/enriched.json'))"`
- [ ] Metadata added: `grep "enrichment_version" output/enriched.json`
- [ ] All conversations processed: Check summary output
- [ ] Logs created: `ls -la logs/`

---

## 🎯 Next Steps

1. **Copy .env.example to .env**
   ```bash
   cp .env.example .env
   ```

2. **Add your OpenRouter API key**
   ```bash
   # Get key at https://openrouter.ai/keys
   # Edit .env and paste key
   ```

3. **Run enrichment**
   ```bash
   npm run enrich
   ```

4. **Check results**
   ```bash
   cat output/enriched.json
   ```

5. **Monitor logs**
   ```bash
   tail -f logs/enrichment-*.log
   ```

---

**Everything is ready! Start enriching your conversations now! 🚀**
