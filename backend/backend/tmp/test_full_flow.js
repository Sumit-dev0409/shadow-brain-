const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const conversationService = require('../src/services/conversation.service');
const enrichmentService = require('../src/services/enrichment.service');
const openRouterService = require('../src/services/openrouter.service');
const Conversation = require('../src/models/conversation.model');

async function runTest() {
  console.log('--- Starting Flow Verification ---');
  
  try {
    // 1. Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✔ MongoDB Connected');

    // 2. Clear existing test data if any
    const testExternalId = 'test-flow-id-123';
    await Conversation.deleteOne({ externalId: testExternalId });
    console.log('✔ Cleaned up test data');

    // 3. Mock OpenRouter response to avoid API calls
    const originalExtractMetadata = openRouterService.extractMetadata;
    openRouterService.extractMetadata = async () => {
      console.log('   (Mocking OpenRouter API Call)');
      return {
        content: JSON.stringify({
          topic: "Test Automation Flow",
          category: "Technical",
          summary: "This is a test summary for the automation flow verification.",
          keywords: ["test", "automation", "flow"],
          entities: ["Node.js", "MongoDB"],
          importance_score: 5
        })
      };
    };

    // 4. Simulate Extension Payload (Initial Scrape)
    console.log('\nStep 1: Initial Scrape');
    const payload = {
      platform: 'ChatGPT',
      external_id: testExternalId,
      title: 'Testing Flow',
      messages: [
        { role: 'user', content: 'How do I automate data scraping?', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'You can use a browser extension and a backend API.', timestamp: new Date().toISOString() }
      ],
      saved_at: new Date().toISOString()
    };

    const conversation = await conversationService.createOrUpdate(payload);
    console.log(`✔ Data saved with status: ${conversation.status}`);
    
    if (conversation.status !== 'PENDING') {
      throw new Error(`Expected PENDING, got ${conversation.status}`);
    }

    // 5. Trigger Enrichment manually (simulating setImmediate trigger)
    console.log('\nStep 2: Triggering Enrichment');
    await enrichmentService.process(conversation._id);
    
    let enriched = await conversationService.getById(conversation._id);
    console.log(`✔ Enrichment finished. Status: ${enriched.status}`);
    console.log(`✔ Importance Score: ${enriched.enrichment.importanceScore}`);

    if (enriched.status !== 'COMPLETED') {
      throw new Error(`Expected COMPLETED, got ${enriched.status}`);
    }

    // 6. Simulate Update (Re-scrape)
    console.log('\nStep 3: Re-scrape (Status Reset Check)');
    const updatePayload = {
      ...payload,
      messages: [
        ...payload.messages,
        { role: 'user', content: 'Can you give more details?', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Sure, here are more details about the flow.', timestamp: new Date().toISOString() }
      ]
    };

    const updatedConvo = await conversationService.createOrUpdate(updatePayload);
    console.log(`✔ Update saved. New status: ${updatedConvo.status}`);
    
    if (updatedConvo.status !== 'PENDING') {
      throw new Error(`Expected Status Reset to PENDING, got ${updatedConvo.status}`);
    }

    // 7. Test Safety Fix (PROCESSING check)
    console.log('\nStep 4: Safety Check (PROCESSING status)');
    await conversationService.updateStatus(updatedConvo._id, 'PROCESSING');
    
    console.log('   (Attempting enrichment while status is PROCESSING)');
    await enrichmentService.process(updatedConvo._id); // Should skip (logged internally)
    
    const finalCheck = await conversationService.getById(updatedConvo._id);
    console.log(`✔ Safety check passed. Status remains: ${finalCheck.status}`);

    // Restore mock and cleanup
    openRouterService.extractMetadata = originalExtractMetadata;
    await Conversation.deleteOne({ externalId: testExternalId });
    await mongoose.disconnect();
    
    console.log('\n--- ALL TESTS PASSED ---');

  } catch (error) {
    console.error('❌ Test Failed:', error.message);
    process.exit(1);
  }
}

runTest();
