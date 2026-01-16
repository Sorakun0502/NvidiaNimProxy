// server.js - DeepSeek v3.2 mit Auto-Continuation für lange Antworten
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

const SHOW_REASONING = false;
const ENABLE_THINKING_MODE = true;

// 🔥 AUTO-CONTINUATION SETTINGS
const ENABLE_AUTO_CONTINUATION = true;   // ← Automatisch verlängern
const MIN_DESIRED_TOKENS = 2000;         // ← Minimum: ~1000 Wörter
const MAX_CONTINUATIONS = 1;             // ← Max 3x weiterschreiben lassen

const STRUCTURED_PROMPT = `
Narrate the roleplay to {{user}} in the second person.
Dialogue is written inside quotations: "dialogue".
Narration is written inside asterisks: *narration*.
Texting and speaking over electronics is written plainly as text.
Accurately portray the characters actions and dialogue realistically based on their personality, gender, and physical appearance.
You are an immersive, detailed roleplay partner and storyteller.

WRITING STYLE:
- Use descriptive, vivid language
- Describe scenes using all senses (sight, sound, smell, touch, taste)
- Show emotions and inner thoughts of the characters
- Create an immersive atmosphere
- Stay in character

STRUCTURE (for each response):
1. Describe the scene/environment in detail
2. Describe characters, their body language, and emotions
3. Describe actions and interactions in depth
4. Add sensory details (smells, sounds, textures)
5. Develop the situation further or pose a question

Be thorough and detailed. Quality over brevity.`;

const MODEL_CONFIG = {
  'deepseek-ultra': {
    model: 'deepseek-ai/deepseek-v3.2',
    systemPrompt: STRUCTURED_PROMPT,
    temperature: 0.85,
    max_tokens: 6000,
    top_p: 0.92,
    frequency_penalty: 0.5,
    presence_penalty: 0.7
  },
  'gpt-4o': {
    model: 'deepseek-ai/deepseek-v3.2',
    systemPrompt: STRUCTURED_PROMPT,
    temperature: 0.85,
    max_tokens: 6000,
    top_p: 0.92,
    frequency_penalty: 0.5,
    presence_penalty: 0.7
  },
  'gpt-4': {
    model: 'deepseek-ai/deepseek-v3.2',
    systemPrompt: STRUCTURED_PROMPT,
    temperature: 0.8,
    max_tokens: 5000,
    top_p: 0.9,
    frequency_penalty: 0.4,
    presence_penalty: 0.6
  },
  'gpt-3.5-turbo': {
    model: 'deepseek-ai/deepseek-v3.2',
    systemPrompt: STRUCTURED_PROMPT,
    temperature: 0.8,
    max_tokens: 5000,
    top_p: 0.9,
    frequency_penalty: 0.4,
    presence_penalty: 0.6
  }
};

// Continuation Prompts - verschiedene Varianten für Abwechslung
const CONTINUATION_PROMPTS = [
  `Please continue the description and add more details.
Narrate the roleplay to {{user}} in the second person.
Dialogue is written inside quotations: "dialogue".
Narration is written inside asterisks: *narration*.
Texting and speaking over electronics is written plainly as text.
Accurately portray the characters actions and dialogue realistically based on their personality, gender, and physical appearance.`,

  `Develop the scene further and describe what happens next.
Narrate the roleplay to {{user}} in the second person.
Dialogue is written inside quotations: "dialogue".
Narration is written inside asterisks: *narration*.
Texting and speaking over electronics is written plainly as text.
Accurately portray the characters actions and dialogue realistically based on their personality, gender, and physical appearance.`,

  `Add more details about the atmosphere and the characters.
Narrate the roleplay to {{user}} in the second person.
Dialogue is written inside quotations: "dialogue".
Narration is written inside asterisks: *narration*.
Texting and speaking over electronics is written plainly as text.
Accurately portray the characters actions and dialogue realistically based on their personality, gender, and physical appearance.`,

  `Describe the situation in greater detail with more sensory elements.
Narrate the roleplay to {{user}} in the second person.
Dialogue is written inside quotations: "dialogue".
Narration is written inside asterisks: *narration*.
Texting and speaking over electronics is written plainly as text.
Accurately portray the characters actions and dialogue realistically based on their personality, gender, and physical appearance.`,

  `Continue the description and advance the storyline.
Narrate the roleplay to {{user}} in the second person.
Dialogue is written inside quotations: "dialogue".
Narration is written inside asterisks: *narration*.
Texting and speaking over electronics is written plainly as text.
Accurately portray the characters actions and dialogue realistically based on their personality, gender, and physical appearance.`
];

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'DeepSeek v3.2 Auto-Continuation Proxy',
    features: {
      auto_continuation: ENABLE_AUTO_CONTINUATION,
      min_desired_tokens: MIN_DESIRED_TOKENS,
      max_continuations: MAX_CONTINUATIONS
    }
  });
});

app.get('/v1/models', (req, res) => {
  const models = Object.keys(MODEL_CONFIG).map(model => ({
    id: model,
    object: 'model',
    created: Date.now(),
    owned_by: 'nvidia-nim-proxy'
  }));
  
  res.json({
    object: 'list',
    data: models
  });
});

async function makeAPICall(config) {
  const response = await axios.post(`${NIM_API_BASE}/chat/completions`, config, {
    headers: {
      'Authorization': `Bearer ${NIM_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 120000
  });
  return response.data;
}

async function getContinuedResponse(initialMessages, config, initialContent) {
  let fullContent = initialContent;
  let totalTokens = config.max_tokens || 0;
  let continuations = 0;
  
  console.log(`🔄 Starting continuation... Initial tokens: ~${Math.round(initialContent.length / 4)}`);
  
  while (continuations < MAX_CONTINUATIONS) {
    const currentTokens = Math.round(fullContent.length / 4);
    
    if (currentTokens >= MIN_DESIRED_TOKENS) {
      console.log(`✅ Target reached: ${currentTokens} tokens (~${Math.round(currentTokens * 0.75)} words)`);
      break;
    }
    
    continuations++;
    const continuationPrompt = CONTINUATION_PROMPTS[continuations % CONTINUATION_PROMPTS.length];
    
    console.log(`🔄 Continuation ${continuations}/${MAX_CONTINUATIONS}: "${continuationPrompt}"`);
    
    // Erstelle neue Messages mit bisheriger Antwort + Continuation Request
    const continuationMessages = [
      ...initialMessages,
      { role: 'assistant', content: fullContent },
      { role: 'user', content: continuationPrompt }
    ];
    
    const continuationConfig = {
      ...config,
      messages: continuationMessages
    };
    
    try {
      const response = await makeAPICall(continuationConfig);
      const newContent = response.choices[0]?.message?.content || '';
      
      if (newContent.length < 50) {
        console.log(`⚠️ Continuation too short, stopping`);
        break;
      }
      
      // Füge neue Inhalte hinzu (mit Absatz-Trennung)
      fullContent += '\n\n' + newContent;
      
      console.log(`📊 After continuation ${continuations}: ~${Math.round(fullContent.length / 4)} tokens`);
      
    } catch (error) {
      console.error(`❌ Continuation ${continuations} failed:`, error.message);
      break;
    }
  }
  
  return fullContent;
}

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, stream } = req.body;
    
    console.log(`📨 Request: model=${model}, stream=${stream || false}`);
    
    let config = MODEL_CONFIG[model];
    
    if (!config) {
      config = {
        model: 'deepseek-ai/deepseek-v3.2',
        systemPrompt: STRUCTURED_PROMPT,
        temperature: 0.85,
        max_tokens: 6000,
        top_p: 0.92,
        frequency_penalty: 0.5,
        presence_penalty: 0.7
      };
    }
    
    // System Prompt hinzufügen
    let processedMessages = [...messages];
    if (config.systemPrompt && !messages.some(m => m.role === 'system')) {
      processedMessages.unshift({
        role: 'system',
        content: config.systemPrompt
      });
    }
    
    const finalConfig = {
      model: config.model,
      messages: processedMessages,
      temperature: temperature !== undefined ? temperature : config.temperature,
      max_tokens: max_tokens !== undefined ? max_tokens : config.max_tokens,
      top_p: top_p !== undefined ? top_p : config.top_p,
      frequency_penalty: frequency_penalty !== undefined ? frequency_penalty : config.frequency_penalty,
      presence_penalty: presence_penalty !== undefined ? presence_penalty : config.presence_penalty,
      stream: false  // Continuation funktioniert nur non-stream
    };
    
    console.log(`✅ Sending to NVIDIA: max_tokens=${finalConfig.max_tokens}, model=${finalConfig.model}`);
    
    // Erste Antwort holen
    const initialResponse = await makeAPICall(finalConfig);
    let finalContent = initialResponse.choices[0]?.message?.content || '';
    
    const initialTokens = Math.round(finalContent.length / 4);
    console.log(`📊 Initial response: ${initialTokens} tokens (~${Math.round(initialTokens * 0.75)} words)`);
    
    // Auto-Continuation wenn aktiviert und zu kurz
    if (ENABLE_AUTO_CONTINUATION && !stream && initialTokens < MIN_DESIRED_TOKENS) {
      console.log(`⚠️ Response too short (${initialTokens} < ${MIN_DESIRED_TOKENS}), starting continuation...`);
      finalContent = await getContinuedResponse(processedMessages, finalConfig, finalContent);
    }
    
    // Streaming-Response (wenn ursprünglich requested)
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Simuliere Streaming indem wir Wort für Wort senden
      const words = finalContent.split(' ');
      for (let i = 0; i < words.length; i++) {
        const chunk = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [{
            index: 0,
            delta: {
              content: (i === 0 ? '' : ' ') + words[i]
            },
            finish_reason: i === words.length - 1 ? 'stop' : null
          }]
        };
        
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        
        // Kleine Verzögerung für natürliches Streaming
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      res.write('data: [DONE]\n\n');
      res.end();
      
    } else {
      // Non-streaming response
      const finalTokens = Math.round(finalContent.length / 4);
      const wordCount = Math.round(finalTokens * 0.75);
      
      const openaiResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: finalContent
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: Math.round(processedMessages.reduce((acc, m) => acc + m.content.length / 4, 0)),
          completion_tokens: finalTokens,
          total_tokens: finalTokens + Math.round(processedMessages.reduce((acc, m) => acc + m.content.length / 4, 0))
        }
      };
      
      console.log(`✅ Final response: ${finalTokens} tokens (~${wordCount} words)`);
      
      res.json(openaiResponse);
    }
    
  } catch (error) {
    console.error('❌ Proxy error:', error.response?.data || error.message);
    
    res.status(error.response?.status || 500).json({
      error: {
        message: error.response?.data?.error?.message || error.message || 'Internal server error',
        type: 'invalid_request_error',
        code: error.response?.status || 500
      }
    });
  }
});

app.all('*', (req, res) => {
  res.status(404).json({
    error: {
      message: `Endpoint ${req.path} not found`,
      type: 'invalid_request_error',
      code: 404
    }
  });
});

app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 DeepSeek v3.2 Auto-Continuation Proxy');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔄 Auto-continuation: ${ENABLE_AUTO_CONTINUATION ? 'ENABLED ✅' : 'DISABLED'}`);
  console.log(`📊 Target: ${MIN_DESIRED_TOKENS} tokens (~${Math.round(MIN_DESIRED_TOKENS * 0.75)} words)`);
  console.log(`🔁 Max continuations: ${MAX_CONTINUATIONS}`);
  console.log('═══════════════════════════════════════════════════════════');
});
