const mongoose = require('mongoose');
const Conversation = require('./src/models/conversation.model');
const conversationService = require('./src/services/conversation.service');
const logger = require('./src/utils/logger');

async function test() {
  await mongoose.connect('mongodb://localhost:27017/brain-shadow');
  console.log('Connected to MongoDB');

  // Find a conversation or create one
  let convo = await Conversation.findOne();
  if (!convo) {
    console.log('Creating mock conversation...');
    convo = await Conversation.create({
      externalId: 'test-' + Date.now(),
      platform: 'chatgpt',
      messages: [{ role: 'user', content: 'hello' }],
      metadata: {
        savedAtExtension: new Date().toISOString(),
        url: 'http://example.com'
      }
    });
  }

  console.log('Current metadata before test:', JSON.stringify(convo.metadata, null, 2));

  const enrichmentData = {
    topic: 'Test Topic',
    category: 'Technical',
    summary: 'This is a test summary for verification.',
    keywords: ['test', 'metadata', 'fix'],
    entities: ['Brain Shadow', 'Antigravity'],
    importance_score: 5,
    enriched_at: new Date(),
    enrichment_version: '1.0.0',
    status: 'COMPLETED'
  };

  console.log('Running updateEnrichment...');
  const result = await conversationService.updateEnrichment(convo._id, enrichmentData);

  console.log('Updated document metadata:', JSON.stringify(result.metadata, null, 2));
  console.log('Updated document status:', result.status);

  // Assertions
  if (result.metadata.topic === enrichmentData.topic &&
      result.metadata.status === 'COMPLETED' &&
      result.status === 'COMPLETED') {
    console.log('✅ TEST PASSED: Metadata persisted successfully!');
  } else {
    console.log('❌ TEST FAILED: Metadata not persisted correctly.');
  }

  await mongoose.disconnect();
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
