const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/conversation.controller');
const jwtAuth    = require('../middleware/jwt.middleware');

// Called by all Brain Shadow browser extensions — requires JWT auth.
router.use(jwtAuth);

router.post('/capture', controller.createConversation);
router.post('/bulk', controller.bulkCreateConversations);

module.exports = router;
