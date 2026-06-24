const express = require('express');
const router  = express.Router();
const { chat } = require('../controllers/chat.controller');

// No auth required — called from Next.js server-side proxy
router.post('/', chat);

module.exports = router;
