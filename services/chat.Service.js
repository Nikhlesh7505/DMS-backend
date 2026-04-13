const Groq = require('groq-sdk');

const getChatResponse = async (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('A non-empty messages array is required.');
  }
  console.log("API KEY:", process.env.GROQ_API_KEY);

  if (!process.env.GROQ_API_KEY) {
    throw new Error('Missing GROQ_API_KEY in backend/.env');
  }

  const client = new Groq({ apiKey: process.env.GROQ_API_KEY});

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content:
          'You are a helpful assistant embedded in a Disaster Management System (DMS). Answer questions about disaster response, alerts, resources, weather, and emergency management. Be concise and helpful.',
      },
      ...messages,
    ],
    temperature: 0.7,
    max_tokens: 1024,
  });

  return completion.choices[0]?.message?.content || 'No response received.';
};

module.exports = { getChatResponse };
