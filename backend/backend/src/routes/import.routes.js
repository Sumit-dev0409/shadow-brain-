const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/conversation.controller');

// Called by all Brain Shadow browser extensions — no auth required.
// Extensions POST { platform, external_id, title, url, messages, captured_at }
router.post('/capture', controller.createConversation);

// Bulk import (optional)
router.post('/bulk', controller.bulkCreateConversations);

module.exports = router;
