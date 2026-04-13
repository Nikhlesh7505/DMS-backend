const { getChatResponse } = require('../services/chat.Service');

const chatHandler = async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'A non-empty messages array is required.' });
    }

    const reply = await getChatResponse(messages);

    res.json({ reply });
  } catch (error) {
    console.error('Chat Error:', error.message);
    res.status(500).json({ error: error.message || 'Something went wrong' });
  }
};

module.exports = { chatHandler };