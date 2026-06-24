const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    lastUsedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ApiKey', apiKeySchema);
