# Brain Shadow Enrichment Engine

Production-ready OpenRouter metadata enrichment system for Brain Shadow conversations.

## 📋 Features

- ✅ **OpenRouter Integration** - Uses open-source LLM models via OpenRouter API
- ✅ **Structured Metadata** - Generates topic, summary, keywords, entities, category, and importance scores
- ✅ **Production-Ready** - Error handling, retry logic, rate limiting, and comprehensive logging
- ✅ **Batch Processing** - Process multiple conversations efficiently
- ✅ **JSON Validation** - Strict schema validation for all metadata
- ✅ **Rate Limiting** - Configurable request throttling to avoid API limits
- ✅ **Comprehensive Logging** - File-based and console logging with progress tracking
- ✅ **Security** - API keys stored in .env (never committed to version control)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd processor
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your OpenRouter API key:

```env
OPENROUTER_API_KEY=your_api_key_here
```

Get an API key at: https://openrouter.ai/keys

### 3. Run Enrichment

```bash
npm run enrich
```

## 📁 Project Structure

```
processor/
├── enrich.js                      # Main enrichment script
├── config.js                      # Configuration management
├── openrouter-client.js           # OpenRouter API client
├── validators.js                  # JSON schema validation
├── package.json                   # Dependencies
├── .env                           # Environment variables (DO NOT COMMIT)
├── .env.example                   # Template for .env
├── input/
│   └── brain-shadow-export-*.json # Input conversations
├── output/
│   └── enriched.json              # Enriched output
├── logs/
│   └── enrichment-*.log           # Processing logs
├── example-input.json             # Example input format
└── example-output.json            # Example output format
```

## ⚙️ Configuration

### .env Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | Required | Your OpenRouter API key |
| `OPENROUTER_MODEL` | `meta-llama/llama-3.1-70b-instruct` | LLM model to use |
| `MAX_RETRIES` | `3` | API retry attempts |
| `RETRY_DELAY_MS` | `1000` | Initial retry delay |
| `RATE_LIMIT_PER_MINUTE` | `20` | Max requests per minute |
| `REQUEST_TIMEOUT_MS` | `30000` | Request timeout |
| `LOG_LEVEL` | `info` | Log level (info/debug) |
| `LOG_TO_FILE` | `true` | Save logs to file |

### Input JSON Format

```json
{
  "exported_at": "ISO timestamp",
  "meta": { "total_conversations": 39 },
  "conversations": [
    {
      "title": "Conversation Title",
      "platform": "chatgpt",
      "messages": [
        {
          "role": "user",
          "content": "Question...",
          "timestamp": "ISO timestamp"
        },
        {
          "role": "assistant",
          "content": "Answer...",
          "timestamp": "ISO timestamp"
        }
      ]
    }
  ]
}
```

### Output JSON Format

```json
{
  "exported_at": "ISO timestamp",
  "enrichment_metadata": {
    "enriched_at": "ISO timestamp",
    "enrichment_version": "1.0.0"
  },
  "conversations": [
    {
      "title": "Conversation Title",
      "platform": "chatgpt",
      "messages": [...],
      "metadata": {
        "enriched_at": "ISO timestamp",
        "enrichment_version": "1.0.0",
        "topic": "Main idea (3-8 words)",
        "category": "Technical|Business|Education|...",
        "summary": "50-150 word summary",
        "keywords": ["keyword1", "keyword2", ...],
        "entities": ["Entity1", "Entity2", ...],
        "importance_score": 1-5
      }
    }
  ]
}
```

## 📊 Metadata Schema

### Importance Score Scale

| Score | Meaning |
|-------|---------|
| 1 | Casual conversation, small talk |
| 2 | Simple question, basic info request |
| 3 | Useful information, moderate value |
| 4 | Project/work related, significant value |
| 5 | Highly valuable knowledge, implementation details |

### Categories

- **Technical**: Programming, architecture, debugging, deployment
- **Business**: Strategy, planning, requirements, decisions
- **Education**: Learning, tutorials, explanations, best practices
- **Creative**: Design, ideation, creative problem-solving
- **Troubleshooting**: Issue resolution, debugging, error fixes
- **Question**: Information seeking, clarification
- **Research**: Research, investigation, analysis
- **Planning**: Project planning, scheduling, roadmap
- **Implementation**: Code implementation, development
- **Review**: Code review, feedback, analysis
- **Other**: Miscellaneous

## 🔄 Processing Workflow

```
1. Load input JSON
   └─ Validate structure
   └─ Ensure conversations array exists

2. For each conversation
   └─ Extract and clean text
   └─ Check for empty content
   └─ Call OpenRouter API
   └─ Parse JSON response
   └─ Validate metadata schema
   └─ Attach to conversation

3. Generate output
   └─ Combine enriched conversations
   └─ Add enrichment metadata
   └─ Calculate statistics

4. Save results
   └─ Write enriched.json
   └─ Write processing log
   └─ Display summary
```

## 🛡️ Error Handling & Recovery

### Retry Logic

- Automatic retry on API failures (default: 3 attempts)
- Exponential backoff: initial delay × 1.5^attempt
- Maximum backoff: 30 seconds

### Rate Limiting

- Enforces per-minute request limit
- Automatic queuing and throttling
- Prevents API rate limit errors

### Validation

- JSON schema validation on all responses
- Type checking for all fields
- Length constraints on strings
- Array size constraints

### Failure Handling

- Conversations that fail enrichment are saved without metadata
- Detailed error logs for debugging
- Process continues on individual failures
- Summary shows success rate

## 📝 Advanced Usage

### Run with Verbose Logging

```bash
npm run enrich:verbose
```

### Validate Configuration

```bash
npm run validate
```

### Process Single Conversation

Create a custom script:

```javascript
const OpenRouterClient = require('./openrouter-client');

async function enrichSingle() {
  const client = new OpenRouterClient();
  const conversationText = "Your conversation text here...";
  
  const result = await client.extractMetadata(conversationText);
  console.log(result);
}

enrichSingle();
```

### Batch Process with Progress

```javascript
const client = new OpenRouterClient();
const texts = [...];

const results = await client.batchExtractMetadata(texts, (current, total) => {
  console.log(`Progress: ${current}/${total}`);
});
```

## 🎯 Best Practices

### Security

1. **Never commit .env file** - Add to .gitignore
2. **Rotate API keys regularly** - OpenRouter dashboard
3. **Use environment variables** - Never hardcode secrets
4. **Restrict API key permissions** - Limit to required endpoints

### Performance

1. **Adjust rate limit** - Balance speed vs API limits
2. **Batch process** - Enrich multiple conversations efficiently
3. **Monitor token usage** - Track API costs
4. **Cache results** - Avoid reprocessing same conversations

### Quality

1. **Review examples** - Check example-output.json for quality
2. **Adjust prompt** - Modify metadataPrompt in config.js for your needs
3. **Validate schema** - Ensure all fields match requirements
4. **Test edge cases** - Try very long/short conversations

### Maintenance

1. **Monitor logs** - Review enrichment-*.log for issues
2. **Update model** - Test newer models on OpenRouter
3. **Backup data** - Keep copies of both input and output
4. **Version control** - Track changes to config and validators

## 🔧 Troubleshooting

### API Key Not Found

```
Error: OPENROUTER_API_KEY is not set
```

**Solution**: Ensure `.env` file exists with your API key

```bash
cp .env.example .env
# Edit .env and add your key
```

### Invalid JSON Response

```
Error: Failed to parse JSON response
```

**Solution**: API returned malformed JSON. Check:

1. Model is valid on OpenRouter
2. Prompt is correct
3. Response is complete

### Rate Limit Exceeded

```
⏳ Rate limit reached. Waiting...
```

**Solution**: This is normal. The system automatically waits. To process faster:

1. Increase `RATE_LIMIT_PER_MINUTE` in .env (carefully)
2. Run during off-peak hours
3. Use different API key (different rate limits)

### Timeout Errors

```
Error: Request timeout
```

**Solution**: Increase `REQUEST_TIMEOUT_MS` in .env:

```env
REQUEST_TIMEOUT_MS=60000
```

### Empty Conversations Skipped

```
⚠️ Skipped conversation X: empty content
```

**Solution**: Input conversation has no messages. Check input file format.

## 📊 Output Examples

See:
- [example-input.json](./example-input.json) - Sample input data
- [example-output.json](./example-output.json) - Sample enriched output

## 📈 Monitoring & Analytics

Check `logs/enrichment-[timestamp].log` for:

- Success rate: % conversations successfully enriched
- Category distribution: breakdown by category
- Importance scores: distribution of importance ratings
- Detailed errors: per-conversation error messages
- Token usage: API usage tracking

## 🚀 Production Deployment

### Docker Setup

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

COPY . .

ENV NODE_ENV=production
ENTRYPOINT ["node", "enrich.js"]
```

### GitHub Actions

```yaml
name: Enrich Conversations
on: [push]

jobs:
  enrich:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run enrich
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      - uses: actions/upload-artifact@v2
        with:
          name: enriched-data
          path: output/enriched.json
```

### Scheduled Processing

```bash
# crontab entry - enrich every day at 2 AM
0 2 * * * cd /path/to/processor && npm run enrich >> /var/log/enrich.log 2>&1
```

## 📚 API Documentation

### OpenRouterClient

```javascript
const client = new OpenRouterClient();

// Extract metadata from single conversation
const result = await client.extractMetadata(conversationText, options);

// Batch process multiple conversations
const results = await client.batchExtractMetadata(texts, progressCallback);
```

### Validators

```javascript
const { validateMetadata, parseJsonResponse, cleanConversationText } = require('./validators');

// Validate metadata object
const validation = validateMetadata(metadata);

// Parse API response
const parsed = parseJsonResponse(apiResponse);

// Clean conversation text
const clean = cleanConversationText(rawText);
```

## 📄 License

MIT - Use freely in your projects

## 🤝 Contributing

Improvements welcome! Areas for enhancement:

- [ ] Streaming responses for long conversations
- [ ] Parallel API requests
- [ ] Database integration
- [ ] Web API wrapper
- [ ] UI dashboard
- [ ] Advanced caching

## 📞 Support

For issues or questions:

1. Check the Troubleshooting section
2. Review example files
3. Check logs for detailed errors
4. Verify .env configuration
