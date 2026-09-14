const express = require('express');
const router = express.Router();
const controller = require('../controllers/conversation.controller');
const jwtAuth = require('../middleware/jwt.middleware');

// All endpoints in container require JWT authentication
router.use(jwtAuth);

router.get('/',             controller.listConversations);
router.get('/:id',          controller.getConversationById);
router.get('/:id/status',   controller.getConversationStatus);

// Memory search
router.post('/search',      controller.searchConversations);

// Write endpoints
router.post('/',            controller.createConversation);
router.post('/bulk',        controller.bulkCreateConversations);

module.exports = router;
