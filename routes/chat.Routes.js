const express = require('express');
const { chatHandler } = require('../controllers/chat.Controller');

const router = express.Router();

router.post('/chat', chatHandler);
console.log("GROQ KEY CHECK:", process.env.GROQ_API_KEY);
module.exports = router;