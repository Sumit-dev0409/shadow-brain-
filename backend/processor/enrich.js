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
 * Load and validate input JSON
 */
function loadInputData() {
  const inputPath = path.join(config.paths.inputDir, config.paths.inputFile);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  try {
    const rawData = fs.readFileSync(inputPath, 'utf8');
    const data = JSON.parse(rawData);

    if (!data.conversations || !Array.isArray(data.conversations)) {
      throw new Error('Input JSON must have a "conversations" array');
    }

    logger.success(`Loaded ${data.conversations.length} conversations from input file`);
    return data;
  } catch (error) {
    throw new Error(`Failed to load input data: ${error.message}`);
  }
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
 * Save enriched data to output file
 */
function saveEnrichedData(data, outputFileName = config.paths.outputFile) {
  const outputPath = path.join(config.paths.outputDir, outputFileName);

  try {
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
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

    // Load data
    logger.info('📂 Loading input data...');
    const inputData = loadInputData();
    logger.info('');

    // Initialize OpenRouter client
    const client = new OpenRouterClient();

    // Process conversations
    logger.info(`🔄 Processing ${inputData.conversations.length} conversations...`);
    logger.info('');

    const results = [];
    const enrichedConversations = [];

    for (let i = 0; i < inputData.conversations.length; i++) {
      const conversation = inputData.conversations[i];
      const conversationText = extractConversationText(conversation);

      // Skip empty conversations
      if (!conversationText.trim()) {
        logger.warn(`Skipped conversation ${i + 1}: empty content`);
        results.push({
          success: false,
          error: 'Empty conversation content',
        });
        enrichedConversations.push(conversation); // Add original without metadata
        continue;
      }

      try {
        logger.info(`[${i + 1}/${inputData.conversations.length}] Processing: "${
          conversation.title || 'Untitled'
        }"`);

        // Extract metadata
        const response = await client.extractMetadata(conversationText);
        const metadata = processMetadataResponse(response.metadata);

        // Enrich conversation
        const enriched = enrichConversation(conversation, metadata);
        enrichedConversations.push(enriched);

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
        enrichedConversations.push(conversation); // Add original without metadata
        logger.info('');
      }
    }

    // Prepare output
    const enrichedData = {
      ...inputData,
      enrichment_metadata: {
        enriched_at: new Date().toISOString(),
        enrichment_version: '1.0.0',
        total_conversations: inputData.conversations.length,
      },
      conversations: enrichedConversations,
    };

    // Save results
    logger.info('💾 Saving enriched data...');
    const outputPath = saveEnrichedData(enrichedData);

    // Generate and save summary
    const summary = generateSummary(enrichedData, results);
    saveLog(summary, results);

    // Display summary
    logger.info('');
    logger.info('═══════════════════════════════════════════════════════');
    logger.success('ENRICHMENT COMPLETE!');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info(`Total Conversations: ${summary.totalConversations}`);
    logger.info(`Successfully Enriched: ${summary.successfullyEnriched}`);
    logger.info(`Failed Enrichments: ${summary.failedEnrichments}`);
    logger.info(`Success Rate: ${summary.successRate}`);
    logger.info('');
    logger.info('Categories Breakdown:');
    Object.entries(summary.categoriesBreakdown).forEach(([cat, count]) => {
      logger.info(`  ${cat}: ${count}`);
    });
    logger.info('');
    logger.info('Importance Score Distribution:');
    Object.entries(summary.importanceScoreDistribution).forEach(([score, count]) => {
      logger.info(`  Score ${score}: ${count}`);
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