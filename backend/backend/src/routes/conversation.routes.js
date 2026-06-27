const express = require('express');
const router = express.Router();
const controller = require('../controllers/conversation.controller');
const auth = require('../middleware/auth.middleware');

// Read endpoints — public (frontend reads without API key)
router.get('/',             controller.listConversations);
router.get('/:id',          controller.getConversationById);
router.get('/:id/status',   controller.getConversationStatus);

// Write endpoints — require API key
router.post('/',      auth, controller.createConversation);
router.post('/bulk',  auth, controller.bulkCreateConversations);

module.exports = router;
