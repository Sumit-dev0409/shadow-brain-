require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app      = express();
const PORT     = process.env.PORT || 8000;
const DATA_DIR = path.join(__dirname, 'data');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Ensure data directory exists ───────────────────────────
fs.mkdirSync(DATA_DIR, { recursive: true });

// ── POST /api/import/capture ───────────────────────────────
// Receives scraped conversation from any browser extension
// and saves it as a JSON file under data/{platform}/{id}.json
app.post('/api/import/capture', (req, res) => {
  try {
    const conversation = req.body;
    if (!conversation || !conversation.external_id) {
      return res.status(400).json({ error: 'Missing external_id in payload' });
    }

    const platform    = (conversation.platform || 'unknown').toLowerCase();
    const id          = conversation.external_id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const platformDir = path.join(DATA_DIR, platform);

    fs.mkdirSync(platformDir, { recursive: true });

    const filePath = path.join(platformDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify({
      ...conversation,
      server_saved_at: new Date().toISOString(),
    }, null, 2));

    console.log(`[Brain Shadow] Saved ${platform}/${id}  (${conversation.message_count ?? '?'} msgs)`);
    res.json({ status: 'saved', platform, id });
  } catch (err) {
    console.error('[Brain Shadow] Save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/conversations ─────────────────────────────────
// Returns all saved conversations across all platforms
app.get('/api/conversations', (req, res) => {
  try {
    const conversations = [];

    if (fs.existsSync(DATA_DIR)) {
      for (const platform of fs.readdirSync(DATA_DIR)) {
        const platformDir = path.join(DATA_DIR, platform);
        if (!fs.statSync(platformDir).isDirectory()) continue;

        for (const file of fs.readdirSync(platformDir)) {
          if (!file.endsWith('.json')) continue;
          try {
            const raw = fs.readFileSync(path.join(platformDir, file), 'utf8');
            conversations.push(JSON.parse(raw));
          } catch { /* skip corrupt files */ }
        }
      }
    }

    const sorted = conversations.sort(
      (a, b) => new Date(b.server_saved_at || b.captured_at || 0) -
                new Date(a.server_saved_at || a.captured_at || 0)
    );

    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/chat ─────────────────────────────────────────
// Forwards the conversation to OpenRouter and streams back the reply
const SYSTEM_PROMPT = `You are Brain Shadow, a personal AI memory assistant. \
You help users recall, connect, and build on their captured knowledge from past \
AI conversations (ChatGPT, Claude, DeepSeek, etc.). \
Be concise and insightful. When relevant, surface patterns or links between topics \
the user has explored before.`;

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY not set in .env' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Type':   'application/json',
        'HTTP-Referer':   'https://brain-shadow.local',
        'X-Title':        'Brain Shadow',
      },
      body: JSON.stringify({
        model:       process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-70b-instruct',
        messages:    [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens:  1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[Brain Shadow] OpenRouter error:', text);
      return res.status(502).json({ error: 'OpenRouter API error', detail: text });
    }

    const data    = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    res.json({ content });
  } catch (err) {
    console.error('[Brain Shadow] Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ───────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`[Brain Shadow] Backend →  http://localhost:${PORT}`);
  console.log(`[Brain Shadow] Data dir → ${DATA_DIR}`);
});
