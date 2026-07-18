const mongoose = require('mongoose');

const getHealth = (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
};

const getDebug = async (req, res) => {
  try {
    const conn = mongoose.connection;
    const info = {
      mongooseVersion: mongoose.version,
      connectionState: conn.readyState, // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
      connectionStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][conn.readyState] || 'unknown',
      host: conn.host,
      port: conn.port,
      databaseName: conn.db?.databaseName || 'N/A',
      collections: [],
      testWrite: null,
    };

    if (conn.readyState === 1 && conn.db) {
      // List collections
      const colls = await conn.db.listCollections().toArray();
      info.collections = colls.map(c => ({ name: c.name, type: c.type }));

      // Count documents in conversations
      try {
        const count = await conn.db.collection('conversations').countDocuments();
        info.conversationCount = count;
      } catch (e) {
        info.conversationCountError = e.message;
      }

      // Test write
      try {
        const result = await conn.db.collection('_debug_health').insertOne({
          _test: true,
          timestamp: new Date()
        });
        await conn.db.collection('_debug_health').deleteOne({ _id: result.insertedId });
        info.testWrite = 'SUCCESS';
      } catch (e) {
        info.testWrite = `FAILED: ${e.message}`;
      }
    }

    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
};

module.exports = {
  getHealth,
  getDebug
};
