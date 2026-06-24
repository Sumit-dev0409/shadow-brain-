#!/usr/bin/env node

/**
 * Brain Shadow Enrichment Engine
 * Enriches conversations with AI-generated metadata using OpenRouter API
 * 
 * Usage: node enrich.js
 * 
 * Configuration: .env file (copy from .env.example)
 */

const fs = require('fs');
const path = require('path');
const OpenRouterClient = require('./openrouter-client');
const {
  validateMetadata,
  parseJsonResponse,
  cleanConversationText,
} = require('./validators');
const config = require('./config');

/**
 * Logger utility
 */
const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  debug: (msg) => {
    if (config.logging.level === 'debug') {
      console.log(`🔧 ${msg}`);
    }
  },
};

/**
 * Create output directories if they don't exist
 */
function ensureOutputDirectories() {
  if (!fs.existsSync(config.paths.outputDir)) {
    fs.mkdirSync(config.paths.outputDir, { recursive: true });
    logger.info(`Created output directory: ${config.paths.outputDir}`);
  }

  if (config.logging.toFile && !fs.existsSync(config.paths.logDir)) {
    fs.mkdirSync(config.paths.logDir, { recursive: true });
    logger.info(`Created log directory: ${config.paths.logDir}`);
  }
}

/**
 * Load existing enriched data for deduplication
 */
function loadExistingEnrichedData() {
  const outputPath = path.join(config.paths.outputDir, config.paths.outputFile);
  
  if (!fs.existsSync(outputPath)) {
    return { conversations: [], enrichment_metadata: {} };
  }

  try {
    const rawData = fs.readFileSync(outputPath, 'utf8');
    const data = JSON.parse(rawData);
    
    if (!data.conversations || !Array.isArray(data.conversations)) {
      return { conversations: [], enrichment_metadata: {} };
    }
    
    return data;
  } catch (error) {
    logger.warn(`Failed to load existing enriched data: ${error.message}`);
    return { conversations: [], enrichment_metadata: {} };
  }
}

/**
 * Load and validate input JSON files from directory
 */
function loadInputData() {
  const inputDir = config.paths.inputDir;

  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory not found: ${inputDir}`);
  }

  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.json'));
  
  if (files.length === 0) {
    logger.warn(`No JSON files found in input directory: ${inputDir}`);
    return { conversations: [], fileCount: 0 };
  }

  logger.info(`Found ${files.length} input files in ${inputDir}`);
  
  const allConversations = [];
  
  for (const file of files) {
    const filePath = path.join(inputDir, file);
    try {
      const rawData = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(rawData);
      
      if (data.conversations && Array.isArray(data.conversations)) {
        allConversations.push(...data.conversations);
      }
    } catch (error) {
      logger.error(`Failed to load ${file}: ${error.message}`);
    }
  }

  return { conversations: allConversations, fileCount: files.length };
}

/**
 * Extract and clean conversation text
 */
function extractConversationText(conversation) {
  if (!conversation.messages || !Array.isArray(conversation.messages)) {
    return '';
  }

  const text = conversation.messages.map((msg) => msg.content || '').join(' ');
  return cleanConversationText(text);
}

/**
 * Process and merge metadata response
 */
function processMetadataResponse(responseText) {
  try {
    // Parse JSON from response
    const metadata = parseJsonResponse(responseText);

    // Validate against schema
    const validation = validateMetadata(metadata);

    if (!validation.valid) {
      throw new Error(`Schema validation failed:\n${validation.errors.join('\n')}`);
    }

    return metadata;
  } catch (error) {
    logger.error(`Metadata processing error: ${error.message}`);
    throw error;
  }
}

/**
 * Create enriched conversation object
 */
function enrichConversation(conversation, metadata) {
  return {
    ...conversation,
    metadata: {
      enriched_at: new Date().toISOString(),
      enrichment_version: '1.0.0',
      ...metadata,
    },
  };
}

/**
 * Save enriched data to output file (merges with existing)
 */
function saveEnrichedData(allConversations, outputFileName = config.paths.outputFile) {
  const outputPath = path.join(config.paths.outputDir, outputFileName);

  const enrichedData = {
    exported_at: new Date().toISOString(),
    meta: {
      last_updated: new Date().toISOString(),
      total_conversations: allConversations.length,
    },
    conversations: allConversations,
  };

  try {
    fs.writeFileSync(outputPath, JSON.stringify(enrichedData, null, 2), 'utf8');
    logger.success(`Enriched data saved to: ${outputPath}`);
    return outputPath;
  } catch (error) {
    throw new Error(`Failed to save enriched data: ${error.message}`);
  }
}

/**
 * Generate summary statistics
 */
function generateSummary(data, results) {
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  const categories = {};
  const importanceScores = {};

  for (const convo of data.conversations) {
    if (convo.metadata) {
      const cat = convo.metadata.category || 'Unknown';
      categories[cat] = (categories[cat] || 0) + 1;

      const score = convo.metadata.importance_score || 0;
      importanceScores[score] = (importanceScores[score] || 0) + 1;
    }
  }

  return {
    totalConversations: data.conversations.length,
    successfullyEnriched: successful,
    failedEnrichments: failed,
    successRate: ((successful / results.length) * 100).toFixed(2) + '%',
    categoriesBreakdown: categories,
    importanceScoreDistribution: importanceScores,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Save processing log
 */
function saveLog(summary, results) {
  if (!config.logging.toFile) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(config.paths.logDir, `enrichment-${timestamp}.log`);

  const log = {
    summary,
    detailedResults: results.map((r, i) => ({
      conversationIndex: i,
      status: r.success ? 'SUCCESS' : 'FAILED',
      error: r.error || null,
      metadata: r.metadata || null,
    })),
  };

  try {
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');
    logger.info(`Log saved to: ${logPath}`);
  } catch (error) {
    logger.warn(`Failed to save log: ${error.message}`);
  }
}

/**
 * Main enrichment workflow
 */
async function main() {
  try {
    logger.info('🚀 Starting Brain Shadow Enrichment Engine...');
    logger.info(`📦 Model: ${config.openrouter.model}`);
    logger.info(`⚙️  Rate Limit: ${config.rateLimit.perMinute} requests/minute`);
    logger.info('');

    // Setup
    ensureOutputDirectories();

    // Load existing data for deduplication
    const existingData = loadExistingEnrichedData();
    const existingIds = new Set(existingData.conversations.map(c => c.external_id).filter(id => !!id));
    
    // Load new data
    logger.info('📂 Scanning input directory...');
    const { conversations: inputConversations, fileCount } = loadInputData();
    logger.info('');

    // Filter duplicates
    const newConversations = inputConversations.filter(c => !existingIds.has(c.external_id));
    const duplicateCount = inputConversations.length - newConversations.length;

    if (newConversations.length === 0) {
      logger.success('✨ All conversations are already enriched. Nothing to do!');
      logger.info(`Input files: ${fileCount}`);
      logger.info(`Total conversations found: ${inputConversations.length}`);
      logger.info(`Duplicates skipped: ${duplicateCount}`);
      return;
    }

    logger.info(`📊 Statistics:`);
    logger.info(`  Input files found: ${fileCount}`);
    logger.info(`  Conversations found: ${inputConversations.length}`);
    logger.info(`  Already enriched: ${duplicateCount}`);
    logger.info(`  New to process: ${newConversations.length}`);
    logger.info('');

    // Initialize OpenRouter client
    const client = new OpenRouterClient();

    // Process new conversations
    logger.info(`🔄 Processing ${newConversations.length} new conversations...`);
    logger.info('');

    const results = [];
    const freshlyEnriched = [];

    for (let i = 0; i < newConversations.length; i++) {
      const conversation = newConversations[i];
      const conversationText = extractConversationText(conversation);

      // Skip empty conversations
      if (!conversationText.trim()) {
        logger.warn(`Skipped conversation ${i + 1}/${newConversations.length}: empty content`);
        results.push({
          success: false,
          error: 'Empty conversation content',
        });
        freshlyEnriched.push(conversation); // Add original without metadata
        continue;
      }

      try {
        logger.info(`[${i + 1}/${newConversations.length}] Processing: "${
          conversation.title || 'Untitled'
        }"`);

        // Extract metadata
        const response = await client.extractMetadata(conversationText);
        const metadata = processMetadataResponse(response.metadata);

        // Enrich conversation
        const enriched = enrichConversation(conversation, metadata);
        freshlyEnriched.push(enriched);

        results.push({
          success: true,
          metadata,
          tokens: response.tokens,
        });

        logger.success(
          `✓ Enriched: ${metadata.category} (importance: ${metadata.importance_score}/5)`
        );
        logger.info('');
      } catch (error) {
        logger.error(`Failed to enrich conversation ${i + 1}: ${error.message}`);
        results.push({
          success: false,
          error: error.message,
        });
        freshlyEnriched.push(conversation); // Add original without metadata
        logger.info('');
      }
    }

    // Combine and save
    const allConversations = [...existingData.conversations, ...freshlyEnriched];

    // Save results
    logger.info('💾 Saving combined data...');
    const outputPath = saveEnrichedData(allConversations);

    // Generate and save summary
    const summary = generateSummary({ conversations: freshlyEnriched }, results);
    saveLog(summary, results);

    // Display summary
    logger.info('');
    logger.info('═══════════════════════════════════════════════════════');
    logger.success('ENRICHMENT COMPLETE!');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info(`Input Files Found: ${fileCount}`);
    logger.info(`Total Conversations Scanned: ${inputConversations.length}`);
    logger.info(`Skipped (Duplicates): ${duplicateCount}`);
    logger.info(`Processed in this run: ${newConversations.length}`);
    logger.info(`Successfully Enriched: ${summary.successfullyEnriched}`);
    logger.info(`Failed Enrichments: ${summary.failedEnrichments}`);
    logger.info(`Current Total in Output: ${allConversations.length}`);
    logger.info('');
    logger.info('New Categories Breakdown:');
    Object.entries(summary.categoriesBreakdown).forEach(([cat, count]) => {
      logger.info(`  ${cat}: ${count}`);
    });
    logger.info('');
    logger.success(`Output saved to: ${outputPath}`);
    logger.info('═══════════════════════════════════════════════════════');
  } catch (error) {
    logger.error('Fatal error during enrichment:');
    logger.error(error.message);
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  logger.error(`Unexpected error: ${error.message}`);
  process.exit(1);
});