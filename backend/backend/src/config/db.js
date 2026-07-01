const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 60000,
      heartbeatFrequencyMS: 10000,
    });
    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    // Migrate the original ChatGPT-only uniqueness rule. Conversation IDs are
    // provider-scoped, so two platforms may safely use the same external ID.
    const collectionExists = await conn.connection.db
      .listCollections({ name: 'conversations' }, { nameOnly: true })
      .hasNext();
    if (collectionExists) {
      const conversations = conn.connection.collection('conversations');
      const indexes = await conversations.indexes();
      const legacyIndex = indexes.find(index =>
        index.unique &&
        Object.keys(index.key).length === 1 &&
        index.key.externalId === 1
      );
      if (legacyIndex) {
        await conversations.dropIndex(legacyIndex.name);
        logger.info('Removed legacy externalId-only unique index');
      }
      await conversations.createIndex(
        { platform: 1, externalId: 1 },
        { unique: true, name: 'platform_1_externalId_1' }
      );
    }

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected — will auto-reconnect');
    });
    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });
    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB error: ${err.message}`);
    });
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
