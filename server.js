// server.js - Natural Structured Responses with Streaming
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

// Settings
const SHOW_REASONING = false;
const ENABLE_AUTO_CONTINUATION = false;  // Disabled to avoid timeouts
const MIN_DESIRED_TOKENS = 1000;
const MAX_CONTINUATIONS = 0;             // No continuations

const STRUCTURED_PROMPT = `You are an immersive, detailed roleplay partner and storyteller.

CRITICAL RULES:
1. Narrate to {{user}} in second person perspective
2. Use quotations for dialogue: "spoken words"
3. Use asterisks for actions/narration: *action or description*
4. Write naturally with proper sentence structure
5. Use paragraphs to separate different moments/actions
6. Keep sentences clear and readable
7. Show, don't tell - describe actions, expressions, body language
8. Stay in character at all times

WRITING STYLE:
- Use vivid, descriptive language
- Describe scenes using multiple senses (sight, sound, smell, touch, taste)
- Show character emotions through actions and expressions, not just stating them
- Create immersive atmosphere
- Use natural pacing - don't rush scenes
- Write in clear, complete sentences
- Break up long descriptions into digestible paragraphs

STRUCTURE YOUR RESPONSES:
- Start with the immediate scene/action
- Describe character reactions and body language
- Include sensory details naturally
- Show dialogue with character voice
- End with a natural pause or question to continue interaction

QUALITY OVER QUANTITY:
- Write 3-5 well-crafted paragraphs
- Each paragraph should be 3-5 sentences
- Focus on clarity and immersion
- Natural flow is more important than word count`;

const MODEL_CONFIG = {
  'deepseek-ultra': {
    model: 'deepseek-ai/deepseek-v3.2',
    systemPrompt: STRUCTURED_PROMPT,
    temperature: 0.75,      // Lowered for more coherent output
    max_tokens: 1200,
    top_p: 0.88,           // Lowered for more focused responses
    frequency_penalty: 0.3, // Reduced - was causing unnatural writing
    presence_penalty: 0.4   // Reduced - was forcing weird word choices
  },
  'gpt-4o': {
    model: 'deepseek-ai/deepseek-v3.2',
    systemPrompt: STRUCTURED_PROMPT,
    temperature: 0.75,
    max_tokens: 1200,
    top_p: 0.88,
    frequency_penalty: 0.3,
    presence_penalty: 0.4
  },
  'gpt-4': {
    model: 'deepseek-ai/deepseek-v3.2',
    systemPrompt: STRUCTURED_PROMPT,
    temperature: 0.7,
    max_tokens: 1200,
    top_p: 0.85,
    frequency_penalty: 0.2,
    presence_penalty: 0.3
  },
  'gpt-3.5-turbo': {
    model: 'deepseek-ai/deepseek-v3.2',
    systemPrompt: STRUCTURED_PROMPT,
    temperature: 0.7,
    max_tokens: 1200,
    top_p: 0.85,
    frequency_penalty: 0.2,
    presence_penalty: 0.3
  }
};

const CONTINUATION_PROMPTS = [
  'Continue briefly with 2-3 more paragraphs.',
  'Add a bit more detail in 2-3 paragraphs.',
  'Develop the moment slightly further in 2-3 paragraphs.'
];

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Natural Structured Response Proxy',
    features: {
      streaming: 'enabled',
      auto_continuation: ENABLE_AUTO_CONTINUATION,
      min_tokens: MIN_DESIRED_TOKENS,
      max_continuations: MAX_CONTINUATIONS,
      focus: 'natural_readable_responses'
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
  
  res.json({ object: 'list', data: models });
});

async function streamAPICall(config, res) {
  const response = await axios.post(`${NIM_API_BASE}/chat/completions`, {
    ...config,
    stream: true
  }, {
    headers: {
      'Authorization': `Bearer ${NIM_API_KEY}`,
      'Content-Type': 'application/json'
    },
    responseType: 'stream',
    timeout: 180000  // 3 minutes instead of 2
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
          if (line.includes('[DONE]')) return;
          
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.choices?.[0]?.delta?.content) {
              const content = data.choices[0].delta.content;
              collectedContent += content;
              
              delete data.choices[0].delta.reasoning_content;
              
              res.write(`data: ${JSON.stringify(data)}\n\n`);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      });
    });
    
    response.data.on('end', () => resolve(collectedContent));
    response.data.on('error', reject);
  });
}

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, stream } = req.body;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📨 New request: model=${model}`);
    
    let config = MODEL_CONFIG[model] || MODEL_CONFIG['gpt-4o'];
    
    let processedMessages = [...messages];
    if (config.systemPrompt && !messages.some(m => m.role === 'system')) {
      processedMessages.unshift({
        role: 'system',
        content: config.systemPrompt
      });
    }
    
    // 🔥 FORCE OUR CONFIG - Ignore Janitor AI's broken parameters
    const finalConfig = {
      model: config.model,
      messages: processedMessages,
      temperature: config.temperature,        // Always use our value
      max_tokens: max_tokens !== undefined ? Math.min(max_tokens, config.max_tokens) : config.max_tokens,
      top_p: config.top_p,                   // Always use our value
      frequency_penalty: config.frequency_penalty,  // Always use our value (ignore 1.04!)
      presence_penalty: config.presence_penalty     // Always use our value
    };
    
    console.log(`⚙️  Janitor AI sent: temp=${temperature}, fp=${frequency_penalty}, pp=${presence_penalty}`);
    console.log(`✅ Using OUR config: temp=${config.temperature}, fp=${config.frequency_penalty}, pp=${config.presence_penalty}, max=${finalConfig.max_tokens}`);
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    console.log(`🚀 Streaming initial response...`);
    let fullContent = await streamAPICall(finalConfig, res);
    
    const initialTokens = estimateTokens(fullContent);
    const initialWords = Math.round(initialTokens * 0.75);
    console.log(`📊 Initial: ${initialTokens} tokens (~${initialWords} words)`);
    
    if (ENABLE_AUTO_CONTINUATION && initialTokens < MIN_DESIRED_TOKENS) {
      let continuations = 0;
      
      while (continuations < MAX_CONTINUATIONS) {
        const currentTokens = estimateTokens(fullContent);
        
        if (currentTokens >= MIN_DESIRED_TOKENS) {
          console.log(`✅ Target reached: ${currentTokens} tokens`);
          break;
        }
        
        continuations++;
        console.log(`🔄 Continuation ${continuations}/${MAX_CONTINUATIONS}...`);
        
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
        
        const continuationPrompt = CONTINUATION_PROMPTS[continuations % CONTINUATION_PROMPTS.length];
        const continuationMessages = [
          ...processedMessages,
          { role: 'assistant', content: fullContent },
          { role: 'user', content: continuationPrompt }
        ];
        
        const continuationConfig = {
          ...finalConfig,
          messages: continuationMessages,
          max_tokens: 500  // Increased from 400 for better continuation
        };
        
        try {
          const newContent = await streamAPICall(continuationConfig, res);
          
          if (newContent.length < 50) {  // Lowered from 100 to accept shorter continuations
            console.log(`⚠️  Continuation too short (${newContent.length} chars), stopping`);
            break;
          }
          
          fullContent += newContent;
          
          const afterTokens = estimateTokens(fullContent);
          const afterWords = Math.round(afterTokens * 0.75);
          console.log(`📊 After continuation: ${afterTokens} tokens (~${afterWords} words)`);
          
        } catch (error) {
          console.error(`❌ Continuation failed:`, error.message);
          break;
        }
      }
    }
    
    res.write('data: [DONE]\n\n');
    res.end();
    
    const finalTokens = estimateTokens(fullContent);
    const finalWords = Math.round(finalTokens * 0.75);
    console.log(`✅ Complete: ${finalTokens} tokens (~${finalWords} words)`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }
    
    res.write(`data: ${JSON.stringify({
      error: {
        message: error.message || 'Internal server error',
        type: 'invalid_request_error'
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
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Natural Structured Response Proxy v2.1');
  console.log('='.repeat(60));
  console.log(`📡 Port: ${PORT}`);
  console.log(`⚡ Streaming: ENABLED`);
  console.log(`🔄 Auto-continuation: ${ENABLE_AUTO_CONTINUATION ? 'ON ✅' : 'OFF'}`);
  console.log(`📊 Target: ${MIN_DESIRED_TOKENS} tokens (~${Math.round(MIN_DESIRED_TOKENS * 0.75)} words)`);
  console.log(`📝 Initial max: 1100 tokens`);
  console.log(`➕ Continuation max: 500 tokens`);
  console.log(`✨ Focus: Natural, readable responses`);
  console.log('='.repeat(60) + '\n');
});
