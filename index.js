const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-ant-';
const MODEL = 'claude-3-5-sonnet-20241022';

// Language configs
const LANGUAGES = {
  spanish: { name: 'Spanish', examples: 'Hello, How are you?, What is your name?' },
  french: { name: 'French', examples: 'Bonjour, Comment allez-vous?, Quel est votre nom?' },
  german: { name: 'German', examples: 'Hallo, Wie geht es dir?, Wie heißt du?' },
  mandarin: { name: 'Mandarin Chinese', examples: '你好, 你好吗?, 你叫什么名字?' },
  italian: { name: 'Italian', examples: 'Ciao, Come stai?, Come ti chiami?' },
  portuguese: { name: 'Portuguese', examples: 'Olá, Como você está?, Qual é o seu nome?' },
};

const DIFFICULTY_LEVELS = {
  beginner: 'Beginner (A1-A2): Use simple vocabulary, short sentences, present tense',
  intermediate: 'Intermediate (B1-B2): Use more complex sentences, varied tenses, idioms',
  advanced: 'Advanced (C1-C2): Use sophisticated vocabulary, complex grammar, native expressions',
};

// Store conversation history per session
const conversations = new Map();

// Initialize conversation
app.post('/api/conversations', (req, res) => {
  const { language, difficulty } = req.body;
  const conversationId = Date.now().toString();
  
  conversations.set(conversationId, {
    messages: [],
    language,
    difficulty,
    createdAt: new Date(),
  });
  
  res.json({ conversationId });
});

// Send message and get AI response
app.post('/api/conversations/:id/message', async (req, res) => {
  try {
    const { id } = req.params;
    const { userMessage } = req.body;
    
    const conversation = conversations.get(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const { language, difficulty, messages } = conversation;
    const systemPrompt = `You are an AI language tutor helping someone practice ${LANGUAGES[language]?.name || language}. 
${DIFFICULTY_LEVELS[difficulty] || DIFFICULTY_LEVELS.intermediate}

Rules:
- Respond ONLY in ${LANGUAGES[language]?.name || language}
- Be encouraging and conversational
- Correct mistakes gently
- Ask follow-up questions to keep conversation flowing
- Keep responses concise (1-3 sentences)
- Use natural, native-like expressions`;

    // Build message history for Claude
    const claudeMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })).concat([
      { role: 'user', content: userMessage }
    ]);
    
    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 150,
        system: systemPrompt,
        messages: claudeMessages
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Claude API error:', error);
      return res.status(response.status).json({ 
        error: 'Failed to get AI response',
        details: error 
      });
    }
    
    const data = await response.json();
    const aiMessage = data.content[0].text;
    
    // Store in conversation history
    messages.push({ role: 'user', content: userMessage });
    messages.push({ role: 'assistant', content: aiMessage });
    
    // Keep only last 10 exchanges (20 messages) for context
    if (messages.length > 20) {
      messages.splice(0, messages.length - 20);
    }
    
    res.json({ message: aiMessage });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get conversation history
app.get('/api/conversations/:id', (req, res) => {
  const { id } = req.params;
  const conversation = conversations.get(id);
  
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  
  res.json(conversation);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', model: MODEL });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎤 TalkBits listening on http://localhost:${PORT}`);
  console.log('Supported languages:', Object.keys(LANGUAGES));
});
