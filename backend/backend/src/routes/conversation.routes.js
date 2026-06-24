const express = require('express');
const router = express.Router();
const controller = require('../controllers/conversation.controller');
const auth = require('../middleware/auth.middleware');

router.use(auth);

router.post('/', controller.createConversation);
router.post('/bulk', controller.bulkCreateConversations);
router.get('/', controller.listConversations);
router.get('/:id', controller.getConversationById);
router.get('/:id/status', controller.getConversationStatus);

module.exports = router;
