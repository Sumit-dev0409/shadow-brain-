/**
 * Brain Shadow — Manual Sync Script
 *
 * Run this when the extension can't reach the backend:
 *   node sync.js
 *
 * It reads conversations saved by the extension (exported JSON)
 * and pushes them directly to the backend / MongoDB.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');

const MONGODB_URI = process.env.MONGODB_URI;
const Conversation = require('./src/models/conversation.model');

async function findExportFile() {
  // Look in Downloads folder for brain-shadow export files
  const downloads = path.join(os.homedir(), 'Downloads');
  const files = fs.readdirSync(downloads)
    .filter(f => f.startsWith('brain_shadow') && f.endsWith('.json'))
    .map(f => ({ name: f, time: fs.statSync(path.join(downloads, f)).mtime }))
    .sort((a, b) => b.time - a.time); // newest first

  if (files.length === 0) {
    console.log('❌ No export file found in Downloads folder.');
    console.log('   Click "Export JSON" in the extension popup first, then run this script again.');
    process.exit(1);
  }

  const latest = path.join(downloads, files[0].name);
  console.log(`📂 Found export file: ${files[0].name}`);
  return latest;
}

async function main() {
  console.log('\n🧠 Brain Shadow — Sync Script\n');

  // 1. Connect to MongoDB
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // 2. Find export file
  const exportPath = process.argv[2] || await findExportFile();
  const raw        = JSON.parse(fs.readFileSync(exportPath, 'utf8'));

  // Support both { conversations: [...] } and direct array formats
  const conversations = Array.isArray(raw) ? raw : (raw.conversations || []);
  console.log(`📊 Found ${conversations.length} conversations in export file\n`);

  let saved = 0, skipped = 0, failed = 0;

  for (const conv of conversations) {
    const externalId = conv.external_id || conv.externalId;
    const platform   = (conv.platform || 'chatgpt').toLowerCase();

    if (!externalId) { skipped++; continue; }

    try {
      const messages = (conv.messages || []).map(m => ({
        role:      m.role,
        content:   m.content || '',
        timestamp: m.timestamp || new Date().toISOString(),
      }));

      await Conversation.findOneAndUpdate(
        { externalId, platform },
        {
          $set: {
            externalId,
            platform,
            title:    conv.title || 'Untitled',
            messages,
            status:   'PENDING',
            error:    null,
            metadata: {
              savedAtExtension: conv.saved_at || conv.captured_at,
              url:              conv.url,
            },
          },
        },
        { upsert: true, new: true }
      );

      saved++;
      process.stdout.write(`\r✅ Saved: ${saved} | ⏭ Skipped: ${skipped} | ❌ Failed: ${failed}`);
    } catch (err) {
      failed++;
      console.error(`\n❌ Failed: ${conv.title} — ${err.message}`);
    }
  }

  console.log(`\n\n🎉 Done! ${saved} saved · ${skipped} skipped · ${failed} failed`);
  console.log('⏳ Backend will now enrich all PENDING conversations with AI metadata...\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Script failed:', err.message);
  process.exit(1);
});
