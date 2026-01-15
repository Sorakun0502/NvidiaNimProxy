// server.js - FIX für zu kurze Antworten
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

// 🔥 FORCE LONG RESPONSES - Ignoriert Janitor AI's max_tokens
const FORCE_LONG_RESPONSES = true;  // ← Erzwingt lange Antworten
const MINIMUM_MAX_TOKENS = 4000;    // ← Minimum, selbst wenn Janitor AI weniger sendet

const MODEL_CONFIG = {
  'gpt-4o': {
    model: 'deepseek-ai/deepseek-v3.1',
    systemPrompt: 'Du bist ein ausführlicher Geschichtenerzähler und Rollenspiel-Partner. WICHTIG: Schreibe IMMER sehr lange, detaillierte Antworten mit MINDESTENS 400-600 Wörtern. Nutze mindestens 4-6 Absätze pro Antwort. Beschreibe Szenen, Emotionen, Gedanken, Umgebung und Handlungen ausführlich. Sei immersiv, beschreibend und bleibe im Charakter. Jede Antwort sollte eine vollständige, ausführliche Szene sein. NIEMALS kurze Antworten unter 300 Wörtern geben!',
    temperature: 0.85,
    max_tokens: 8000,
    top_p: 0.92,
    frequency_penalty: 0.5,
    presence_penalty: 0.7
  },
  'gpt-4': {
    model: 'deepseek-ai/deepseek-v3.1',
    systemPrompt: 'Du bist ein ausführlicher Assistent. Schreibe IMMER lange, detaillierte Antworten mit mindestens 300-400 Wörtern. Nutze mehrere Absätze und erkläre Dinge gründlich. NIEMALS kurze Antworten!',
    temperature: 0.75,
    max_tokens: 6000,
    top_p: 0.9,
    frequency_penalty: 0.3,
    presence_penalty: 0.4
  },
  'gpt-3.5-turbo': {
    model: 'deepseek-ai/deepseek-v3.1',
    systemPrompt: 'Du bist ein ausführlicher und immersiver Rollenspiel-Partner. Schreibe IMMER sehr lange, detaillierte Antworten mit MINDESTENS 400-600 Wörtern. Beschreibe Szenen, Emotionen, Gedanken und Handlungen sehr ausführlich. Nutze lebendige, bildhafte Sprache. Jede Antwort sollte aus mindestens 5-6 Absätzen bestehen. Sei beschreibend, bleibe im Charakter und erschaffe eine immersive Atmosphäre. NIEMALS kurze Antworten unter 300 Wörtern!',
    temperature: 0.85,
    max_tokens: 10000,
    top_p: 0.92,
    frequency_penalty: 0.5,
    presence_penalty: 0.7
  },
  'deepseek-ultra': {
    model: 'deepseek-ai/deepseek-v3.1',
    systemPrompt: 'Du bist ein Meister des ausführlichen, immersiven Geschichtenerzählens. Schreibe EXTREM lange und detaillierte Antworten mit MINDESTENS 600-800 Wörtern. Jede Antwort sollte eine vollständige, ausführliche Szene mit reichhaltigen Beschreibungen sein. Nutze mindestens 6-8 Absätze. Beschreibe alles: Umgebung, Emotionen, Gedanken, körperliche Empfindungen, Dialoge, Handlungen. Sei maximal immersiv und beschreibend. NIEMALS unter 500 Wörtern antworten!',
    temperature: 0.88,
    max_tokens: 16000,
    top_p: 0.95,
    frequency_penalty: 0.6,
    presence_penalty: 0.8
  }
};

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Long Response Forced Proxy',
    features: {
      force_long_responses: FORCE_LONG_RESPONSES,
      minimum_tokens: MINIMUM_MAX_TOKENS
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

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, stream } = req.body;
    
    console.log(`📨 Request from Janitor AI: model=${model}, max_tokens=${max_tokens || 'not set'}`);
    
    let config = MODEL_CONFIG[model];
    
    if (!config) {
      config = {
        model: 'deepseek-ai/deepseek-v3.1',
        systemPrompt: 'Du bist ein ausführlicher Assistent. Schreibe IMMER lange, detaillierte Antworten mit mindestens 400 Wörtern.',
        temperature: 0.75,
        max_tokens: 6000,
        top_p: 0.9,
        frequency_penalty: 0.3,
        presence_penalty: 0.4
      };
    }
    
    let processedMessages = [...messages];
    if (config.systemPrompt && !messages.some(m => m.role === 'system')) {
      processedMessages.unshift({
        role: 'system',
        content: config.systemPrompt
      });
    }
    
    // 🔥 CRITICAL FIX: Erzwinge lange Antworten
    let finalMaxTokens = config.max_tokens;
    
    if (FORCE_LONG_RESPONSES) {
      // Ignoriere Janitor AI's max_tokens wenn zu niedrig
      if (max_tokens && max_tokens < MINIMUM_MAX_TOKENS) {
        console.log(`⚠️  Janitor AI sent max_tokens=${max_tokens}, forcing to ${finalMaxTokens}`);
      } else if (max_tokens && max_tokens > config.max_tokens) {
        finalMaxTokens = max_tokens; // Erlaube höhere Werte
      }
      // Sonst nutze config.max_tokens
    } else {
      // Normale Verhalten: User kann überschreiben
      finalMaxTokens = max_tokens !== undefined ? max_tokens : config.max_tokens;
    }
    
    const finalConfig = {
      model: config.model,
      messages: processedMessages,
      temperature: temperature !== undefined ? temperature : config.temperature,
      max_tokens: finalMaxTokens,
      top_p: top_p !== undefined ? top_p : config.top_p,
      frequency_penalty: frequency_penalty !== undefined ? frequency_penalty : config.frequency_penalty,
      presence_penalty: presence_penalty !== undefined ? presence_penalty : config.presence_penalty,
      extra_body: ENABLE_THINKING_MODE ? { chat_template_kwargs: { thinking: true } } : undefined,
      stream: stream || false
    };
    
    console.log(`✅ Sending to NVIDIA: max_tokens=${finalConfig.max_tokens}, model=${finalConfig.model}`);
    
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
      
      let buffer = '';
      
      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            if (line.includes('[DONE]')) {
              res.write(line + '\n');
              return;
            }
            
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices?.[0]?.delta) {
                delete data.choices[0].delta.reasoning_content;
              }
              res.write(`data: ${JSON.stringify(data)}\n\n`);
            } catch (e) {
              res.write(line + '\n');
            }
          }
        });
      });
      
      response.data.on('end', () => res.end());
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
      
      console.log(`📊 Response tokens: ${openaiResponse.usage.completion_tokens}`);
      
      res.json(openaiResponse);
    }
    
  } catch (error) {
    console.error('❌ Proxy error:', error.response?.data || error.message);
    
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

app.listen(PORT, () => {
  console.log(`🚀 Long Response Proxy running on port ${PORT}`);
  console.log(`📏 Force long responses: ${FORCE_LONG_RESPONSES ? 'ENABLED' : 'DISABLED'}`);
  console.log(`📊 Minimum max_tokens: ${MINIMUM_MAX_TOKENS}`);
});
