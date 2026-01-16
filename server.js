// server.js - Streaming + Auto-Continuation für beste Performance
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
const ENABLE_THINKING_MODE = false;

// 🔥 AUTO-CONTINUATION SETTINGS
const ENABLE_AUTO_CONTINUATION = true;
const MIN_DESIRED_TOKENS = 2000;
const MAX_CONTINUATIONS = 1;

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
Accurately portray the characters actions and dialogue realistically based on their personality, gender, and physical appearance.`
];

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Streaming + Auto-Continuation Proxy',
    features: {
      auto_continuation: ENABLE_AUTO_CONTINUATION,
      streaming: 'enabled',
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

// Stream a single API call
async function streamAPICall(config, res, isFirst = true) {
  const response = await axios.post(`${NIM_API_BASE}/chat/completions`, {
    ...config,
    stream: true
  }, {
    headers: {
      'Authorization': `Bearer ${NIM_API_KEY}`,
      'Content-Type': 'application/json'
    },
    responseType: 'stream',
    timeout: 120000
  });
  
  let buffer = '';
  let collectedContent = '';
  
  return new Promise((resolve, reject) => {
    response.data.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      lines.forEach(line => {
        if (line.startsWith('data: ')) {
          if (line.includes('[DONE]')) {
            return;
          }
          
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.choices?.[0]?.delta?.content) {
              const content = data.choices[0].delta.content;
              collectedContent += content;
              
              // Remove reasoning if present
              delete data.choices[0].delta.reasoning_content;
              
              // Forward to client
              res.write(`data: ${JSON.stringify(data)}\n\n`);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      });
    });
    
    response.data.on('end', () => {
      resolve(collectedContent);
    });
    
    response.data.on('error', (err) => {
      reject(err);
    });
  });
}

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, stream } = req.body;
    
    console.log(`📨 Request: model=${model}, stream=${stream}`);
    
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
      presence_penalty: presence_penalty !== undefined ? presence_penalty : config.presence_penalty
    };
    
    console.log(`✅ Starting streaming response...`);
    
    // Set up streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Stream first response
    let fullContent = await streamAPICall(finalConfig, res, true);
    
    const initialTokens = Math.round(fullContent.length / 4);
    console.log(`📊 Initial response: ${initialTokens} tokens (~${Math.round(initialTokens * 0.75)} words)`);
    
    // Auto-continuation if needed
    if (ENABLE_AUTO_CONTINUATION && initialTokens < MIN_DESIRED_TOKENS) {
      let continuations = 0;
      
      while (continuations < MAX_CONTINUATIONS) {
        const currentTokens = Math.round(fullContent.length / 4);
        
        if (currentTokens >= MIN_DESIRED_TOKENS) {
          console.log(`✅ Target reached: ${currentTokens} tokens`);
          break;
        }
        
        continuations++;
        const continuationPrompt = CONTINUATION_PROMPTS[continuations % CONTINUATION_PROMPTS.length];
        
        console.log(`🔄 Continuation ${continuations}/${MAX_CONTINUATIONS}...`);
        
        // Add separator
        const separator = '\n\n';
        res.write(`data: ${JSON.stringify({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [{
            index: 0,
            delta: { content: separator },
            finish_reason: null
          }]
        })}\n\n`);
        
        fullContent += separator;
        
        // Create continuation messages
        const continuationMessages = [
          ...processedMessages,
          { role: 'assistant', content: fullContent },
          { role: 'user', content: continuationPrompt }
        ];
        
        const continuationConfig = {
          ...finalConfig,
          messages: continuationMessages
        };
        
        try {
          const newContent = await streamAPICall(continuationConfig, res, false);
          
          if (newContent.length < 50) {
            console.log(`⚠️ Continuation too short, stopping`);
            break;
          }
          
          fullContent += newContent;
          
          console.log(`📊 After continuation ${continuations}: ~${Math.round(fullContent.length / 4)} tokens`);
          
        } catch (error) {
          console.error(`❌ Continuation ${continuations} failed:`, error.message);
          break;
        }
      }
    }
    
    // Send [DONE]
    res.write('data: [DONE]\n\n');
    res.end();
    
    const finalTokens = Math.round(fullContent.length / 4);
    console.log(`✅ Complete: ${finalTokens} tokens (~${Math.round(finalTokens * 0.75)} words)`);
    
  } catch (error) {
    console.error('❌ Proxy error:', error.response?.data || error.message);
    
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }
    
    res.write(`data: ${JSON.stringify({
      error: {
        message: error.response?.data?.error?.message || error.message || 'Internal server error',
        type: 'invalid_request_error',
        code: error.response?.status || 500
      }
    })}\n\n`);
    
    res.end();
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
  console.log('🚀 Streaming + Auto-Continuation Proxy');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📡 Port: ${PORT}`);
  console.log(`⚡ Streaming: ENABLED`);
  console.log(`🔄 Auto-continuation: ${ENABLE_AUTO_CONTINUATION ? 'ENABLED ✅' : 'DISABLED'}`);
  console.log(`📊 Target: ${MIN_DESIRED_TOKENS} tokens (~${Math.round(MIN_DESIRED_TOKENS * 0.75)} words)`);
  console.log(`🔁 Max continuations: ${MAX_CONTINUATIONS}`);
  console.log('═══════════════════════════════════════════════════════════');
});
