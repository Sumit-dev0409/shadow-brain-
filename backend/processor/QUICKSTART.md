# ⚡ QUICK START - Brain Shadow Enrichment

> Get started in 5 minutes!

## Step 1: Install (1 minute)

```bash
cd processor
npm install
```

## Step 2: Configure (2 minutes)

```bash
# Copy template
cp .env.example .env

# Edit and add your API key
# Get key at: https://openrouter.ai/keys
nano .env        # or 'code .env' in VS Code
```

**Minimum .env setup:**
```env
OPENROUTER_API_KEY=sk-or-your-key-here
```

## Step 3: Run (1 minute)

```bash
npm run enrich
```

## Step 4: Check Results (1 minute)

```bash
cat output/enriched.json
# or open in VS Code
code output/enriched.json
```

---

## 🎯 What You Get

Each conversation gets enriched with:

```json
{
  "topic": "Main idea (3-8 words)",
  "category": "Technical, Business, etc.",
  "summary": "50-150 word detailed summary",
  "keywords": ["keyword1", "keyword2", ...],
  "entities": ["Tool1", "Tool2", ...],
  "importance_score": 1-5
}
```

---

## 📊 Importance Scale

| Score | Meaning |
|-------|---------|
| 1 | Casual chat |
| 2 | Simple question |
| 3 | Useful info |
| 4 | Project/work |
| 5 | Highly valuable |

---

## 🔧 Common Configurations

### Faster Processing (fewer retries)
```env
MAX_RETRIES=1
RATE_LIMIT_PER_MINUTE=30
```

### More Reliable (more retries)
```env
MAX_RETRIES=5
RETRY_DELAY_MS=2000
```

### Detailed Logging
```env
LOG_LEVEL=debug
LOG_TO_FILE=true
```

---

## 🐛 Troubleshooting

### "API Key not set"
```bash
# Check your .env file
cat .env
# Make sure OPENROUTER_API_KEY is set
```

### "No input files found"
```bash
# Place your conversation export in input/
cp ~/Downloads/brain-shadow-export*.json input/
```

### "Request timeout"
```env
# Increase timeout in .env
REQUEST_TIMEOUT_MS=60000
```

---

## 📚 Full Guides

- **README.md** - Complete documentation
- **SETUP.md** - Detailed setup guide
- **IMPLEMENTATION_SUMMARY.md** - What was built

---

## 🚀 Next Steps

1. ✅ Install dependencies
2. ✅ Add API key to .env
3. ✅ Run enrichment
4. ✅ Check output/enriched.json
5. ✅ Schedule with cron (optional)

---

## 💡 Pro Tips

### Test First
```bash
# Use example input to test
cp example-input.json input/test.json
npm run enrich
# Compare with example-output.json
```

### Monitor Progress
```bash
# Watch logs in real-time
tail -f logs/enrichment-*.log
```

### Batch Process
```bash
# Enrich multiple export files
for file in input/brain-shadow-export-*.json; do
  npm run enrich
done
```

### Check Stats
```bash
# View summary
grep "Success Rate" logs/enrichment-*.log
```

---

## 🔗 Resources

- **OpenRouter API**: https://openrouter.ai
- **Get Keys**: https://openrouter.ai/keys
- **Browse Models**: https://openrouter.ai/models
- **Pricing**: https://openrouter.ai/pricing

---

## 📞 Need Help?

1. Check logs: `cat logs/enrichment-*.log`
2. Review README.md troubleshooting section
3. Verify .env has OPENROUTER_API_KEY set
4. Try with example-input.json first

---

**That's it! You're ready to enrich conversations! 🎉**

```bash
npm run enrich
```
