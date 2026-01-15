// server.js - Optimiert für LANGE, ausführliche Antworten in Janitor AI
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

// REASONING DISPLAY - AUF FALSE FÜR LÄNGERE ANTWORTEN
const SHOW_REASONING = false;

// THINKING MODE
const ENABLE_THINKING_MODE = false;

// OPTIMIERT FÜR LANGE TEXTE
const MODEL_CONFIG = {
  'gpt-4o': {
    model: 'deepseek-ai/deepseek-v3.1',
    systemPrompt: 'Du bist ein ausführlicher und immersiver Rollenspiel-Partner. Schreibe lange, detaillierte Antworten mit mindestens 300-400 Wörtern. Beschreibe Szenen, Emotionen, Gedanken und Handlungen sehr genau. Nutze lebendige, bildhafte Sprache. Jede Antwort sollte aus mehreren Absätzen bestehen. Sei beschreibend, bleibe im Charakter und erschaffe eine immersive Atmosphäre.',
    temperature: 0.85,
    max_tokens: 4000,
    top_p: 0.92,
    frequency_penalty: 0.4,
    presence_penalty: 0.6
  },
  'gpt-4': {
    model: 'deepseek-ai/deepseek-r1-distill-llama-70b',
    systemPrompt: 'Du bist ein ausführlicher Assistent. Gib detaillierte, gut strukturierte Antworten mit mindestens 200-300 Wörtern. Erkläre Dinge gründlich und nutze Beispiele.',
    temperature: 0.75,
    max_tokens: 3000,
    top_p: 0.9,
    frequency_penalty: 0.2,
    presence_penalty: 0.2
  },
  'gpt-3.5-turbo': {
    model: 'deepseek-ai/deepseek-r1-distill-qwen-32b',
    systemPrompt: 'Du bist ein hilfreicher Assistent. Gib strukturierte Antworten mit mindestens 150-200 Wörtern.',
    temperature: 0.7,
    max_tokens: 2000,
    top_p: 0.9,
    frequency_penalty: 0.2,
    presence_penalty: 0.2
  },
  'deepseek-ultra-long': {
    model: 'deepseek-ai/deepseek-v3.1',
    systemPrompt: 'Du bist ein Meister des ausführlichen Geschichtenerzählens. Schreibe SEHR lange, detaillierte Antworten mit 500+ Wörtern. Nutze bildhafte Sprache, ausführliche Beschreibungen und erschaffe eine lebendige, immersive Welt. Jede Antwort sollte aus mindestens 5-6 Absätzen bestehen.',
    temperature: 0.88,
    max_tokens: 6000,
    top_p: 0.95,
    frequency_penalty: 0.5,
    presence_penalty: 0.7
  },
  'claude-3-opus': {
    model: 'openai/gpt-oss-120b',
    systemPrompt: 'Du bist ein ausführlicher und intelligenter Assistent. Gib detaillierte Antworten mit mindestens 250 Wörtern.',
    temperature: 0.75,
    max_tokens: 3500,
    top_p: 0.9,
    frequency_penalty: 0.2,
    presence_penalty: 0.3
  },
  'gemini-pro': {
    model: 'qwen/qwen3-next-80b-a3b-thinking',
    systemPrompt: 'Du bist ein vielseitiger Assistent. Schreibe ausführliche, gut strukturierte Antworten mit mindestens 200 Wörtern.',
    temperature: 0.7,
    max_tokens: 3000,
    top_p: 0.9,
    frequency_penalty: 0.2,
    presence_penalty: 0.2
  }
};

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Long-Text Optimized Proxy',
    features: {
      reasoning_display: SHOW_REASONING,
      thinking_mode: ENABLE_THINKING_MODE,
      optimized_for: 'LONG detailed responses'
    },
    statistics: {
      total_requests: totalRequests,
      total_prompt_tokens: totalPromptTokens,
      total_completion_tokens: totalCompletionTokens,
      total_tokens: totalTokens,
      average_tokens_per_request: totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0
    }
  });
});

app.get('/v1/models', (req, res) => {
  const models = Object.keys(MODEL_CONFIG).map(model => ({
    id: model,
    object: 'model',
    created: Date.now(),
    owned_by: 'nvidia-nim-proxy',
    config: {
      max_tokens: MODEL_CONFIG[model].max_tokens,
      temperature: MODEL_CONFIG[model].temperature
    }
  }));
  
  res.json({
    object: 'list',
    data: models
  });
});

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, stream } = req.body;
    
    let config = MODEL_CONFIG[model];
    
    if (!config) {
      const modelLower = model.toLowerCase();
      let nimModel;
      
      if (modelLower.includes('gpt-4') || modelLower.includes('405b')) {
        nimModel = 'meta/llama-3.1-405b-instruct';
      } else if (modelLower.includes('claude') || modelLower.includes('70b')) {
        nimModel = 'meta/llama-3.1-70b-instruct';
      } else {
        nimModel = 'meta/llama-3.1-8b-instruct';
      }
      
      config = {
        model: nimModel,
        systemPrompt: 'Du bist ein ausführlicher Assistent. Schreibe lange, detaillierte Antworten.',
        temperature: 0.75,
        max_tokens: 3000,
        top_p: 0.9,
        frequency_penalty: 0.2,
        presence_penalty: 0.2
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
      presence_penalty: presence_penalty !== undefined ? presence_penalty : config.presence_penalty,
      stream: stream || false
    };
    
    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, finalConfig, {
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: stream ? 'stream' : 'json'
    });
    
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      let streamTokens = { prompt: 0, completion: 0, total: 0 };
      
      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        lines.forEach(line => {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.usage) {
                streamTokens.prompt = data.usage.prompt_tokens || 0;
                streamTokens.completion = data.usage.completion_tokens || 0;
                streamTokens.total = data.usage.total_tokens || 0;
              }
            } catch (e) {}
          }
        });
      });
      
      response.data.pipe(res);
      
      response.data.on('end', () => {
        // Log streaming token usage
        if (streamTokens.total > 0) {
          totalRequests++;
          totalPromptTokens += streamTokens.prompt;
          totalCompletionTokens += streamTokens.completion;
          totalTokens += streamTokens.total;
          
          console.log('\n=== TOKEN USAGE (STREAM) ===');
          console.log(`Request #${totalRequests}`);
          console.log(`Model: ${model} -> ${config.model}`);
          console.log(`Prompt Tokens: ${streamTokens.prompt}`);
          console.log(`Completion Tokens: ${streamTokens.completion}`);
          console.log(`Total Tokens: ${streamTokens.total}`);
          console.log(`Words (approx): ${Math.round(streamTokens.completion * 0.75)}`);
          console.log('--- Session Totals ---');
          console.log(`Total Requests: ${totalRequests}`);
          console.log(`Total Tokens Used: ${totalTokens}`);
          console.log(`Average per Request: ${Math.round(totalTokens / totalRequests)}`);
          console.log('============================\n');
        }
      });
      
      response.data.on('error', (err) => {
        console.error('Stream error:', err);
        res.end();
      });
    } else {
      const openaiResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: response.data.choices.map(choice => ({
          index: choice.index,
          message: {
            role: choice.message.role,
            content: choice.message?.content || ''
          },
          finish_reason: choice.finish_reason
        })),
        usage: response.data.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };
      
      // Log Token Usage
      const usage = response.data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      totalRequests++;
      totalPromptTokens += usage.prompt_tokens;
      totalCompletionTokens += usage.completion_tokens;
      totalTokens += usage.total_tokens;
      
      console.log('\n=== TOKEN USAGE ===');
      console.log(`Request #${totalRequests}`);
      console.log(`Model: ${model} -> ${config.model}`);
      console.log(`Prompt Tokens: ${usage.prompt_tokens}`);
      console.log(`Completion Tokens: ${usage.completion_tokens}`);
      console.log(`Total Tokens: ${usage.total_tokens}`);
      console.log(`Words (approx): ${Math.round(usage.completion_tokens * 0.75)}`);
      console.log('--- Session Totals ---');
      console.log(`Total Requests: ${totalRequests}`);
      console.log(`Total Tokens Used: ${totalTokens}`);
      console.log(`Average per Request: ${Math.round(totalTokens / totalRequests)}`);
      console.log('===================\n');
      
      res.json(openaiResponse);
    }
    
  } catch (error) {
    console.error('Proxy error:', error.message);
    
    res.status(error.response?.status || 500).json({
      error: {
        message: error.message || 'Internal server error',
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

// Token Statistics Tracking
let totalRequests = 0;
let totalPromptTokens = 0;
let totalCompletionTokens = 0;
let totalTokens = 0;

app.listen(PORT, () => {
  console.log(`Long-Text Optimized Proxy running on port ${PORT}`);
  console.log(`Optimized for LONG, detailed responses`);
  console.log(`Max tokens: 2000-6000 depending on model`);
  console.log(`Token logging: ENABLED`);
});
