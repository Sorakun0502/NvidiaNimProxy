// server.js - Advanced OpenAI to NVIDIA NIM API Proxy mit erweiterten Konfigurationen
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// NVIDIA NIM API configuration
const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

// 🔥 REASONING DISPLAY TOGGLE
const SHOW_REASONING = false;

// 🔥 THINKING MODE TOGGLE
const ENABLE_THINKING_MODE = false;

// 🎯 ERWEITERTE MODEL KONFIGURATION
// Hier können Sie für jedes Modell individuelle Einstellungen definieren
const MODEL_CONFIG = {
  'gpt-4o': {
    model: 'deepseek-ai/deepseek-r1-0528',
    systemPrompt: '',
    temperature: 0.7,
    max_tokens: 8000,
    top_p: 0.9,
    frequency_penalty: 0.0,
    presence_penalty: 0.0
  },
  'gpt-4': {
    model: 'deepseek-ai/deepseek-r1-distill-llama-70b',
    systemPrompt: 'Du bist ein professioneller Experte. Gib präzise und gut strukturierte Antworten.',
    temperature: 0.5,
    max_tokens: 4000,
    top_p: 0.85,
    frequency_penalty: 0.2,
    presence_penalty: 0.0
  },
  'gpt-3.5-turbo': {
    model: 'deepseek-ai/deepseek-v3.2',
    systemPrompt: 'Du bist ein ausführlicher und immersiver Rollenspiel-Partner. Schreibe lange, detaillierte Antworten mit mindestens 300-400 Wörtern. Beschreibe Szenen, Emotionen, Gedanken und Handlungen sehr genau. Nutze lebendige, bildhafte Sprache. Jede Antwort sollte aus mehreren Absätzen bestehen. Sei beschreibend, bleibe im Charakter und erschaffe eine immersive Atmosphäre.',
    temperature: 0.85,
    max_tokens: 16000,
    top_p: 0.92,
    frequency_penalty: 0.4,
    presence_penalty: 0.6
  },
  'deepseek-r1-creative': {
    model: 'deepseek-ai/deepseek-r1-distill-llama-70b',
    systemPrompt: 'Du bist ein kreativer Geschichtenerzähler. Sei fantasievoll, detailliert und unterhaltsam.',
    temperature: 0.9,
    max_tokens: 6000,
    top_p: 0.95,
    frequency_penalty: 0.3,
    presence_penalty: 0.5
  },
  'deepseek-r1-coder': {
    model: 'qwen/qwen3-coder-480b-a35b-instruct',
    systemPrompt: 'Du bist ein Programmier-Experte. Schreibe sauberen, gut dokumentierten Code mit Erklärungen.',
    temperature: 0.2,
    max_tokens: 8000,
    top_p: 0.8,
    frequency_penalty: 0.0,
    presence_penalty: 0.0
  },
  'deepseek-r1-roleplay': {
    model: 'deepseek-ai/deepseek-r1-distill-llama-70b',
    systemPrompt: 'Du bist ein einfühlsamer Charakter im Rollenspiel. Bleibe im Charakter und antworte immersiv.',
    temperature: 0.85,
    max_tokens: 5000,
    top_p: 0.92,
    frequency_penalty: 0.4,
    presence_penalty: 0.6
  },
  'claude-3-opus': {
    model: 'openai/gpt-oss-120b',
    systemPrompt: 'Du bist ein hochintelligenter Assistent mit ausgezeichnetem Urteilsvermögen.',
    temperature: 0.7,
    max_tokens: 6000,
    top_p: 0.9,
    frequency_penalty: 0.0,
    presence_penalty: 0.0
  },
  'gemini-pro': {
    model: 'qwen/qwen3-next-80b-a3b-thinking',
    systemPrompt: 'Du bist ein vielseitiger Assistent mit starken analytischen Fähigkeiten.',
    temperature: 0.65,
    max_tokens: 4000,
    top_p: 0.88,
    frequency_penalty: 0.1,
    presence_penalty: 0.1
  }
};

// 🎨 PRESET KATEGORIEN
// Schneller Zugriff auf verschiedene "Persönlichkeiten"
const PRESETS = {
  creative: {
    temperature: 0.9,
    top_p: 0.95,
    frequency_penalty: 0.3,
    presence_penalty: 0.5
  },
  precise: {
    temperature: 0.2,
    top_p: 0.8,
    frequency_penalty: 0.0,
    presence_penalty: 0.0
  },
  balanced: {
    temperature: 0.7,
    top_p: 0.9,
    frequency_penalty: 0.1,
    presence_penalty: 0.1
  },
  roleplay: {
    temperature: 0.85,
    top_p: 0.92,
    frequency_penalty: 0.4,
    presence_penalty: 0.6
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Advanced OpenAI to NVIDIA NIM Proxy',
    features: {
      reasoning_display: SHOW_REASONING,
      thinking_mode: ENABLE_THINKING_MODE,
      custom_configs: Object.keys(MODEL_CONFIG).length,
      presets: Object.keys(PRESETS)
    }
  });
});

// List models endpoint (OpenAI compatible)
app.get('/v1/models', (req, res) => {
  const models = Object.keys(MODEL_CONFIG).map(model => ({
    id: model,
    object: 'model',
    created: Date.now(),
    owned_by: 'nvidia-nim-proxy',
    config: {
      temperature: MODEL_CONFIG[model].temperature,
      max_tokens: MODEL_CONFIG[model].max_tokens,
      has_system_prompt: !!MODEL_CONFIG[model].systemPrompt
    }
  }));
  
  res.json({
    object: 'list',
    data: models
  });
});

// Chat completions endpoint (main proxy)
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, stream } = req.body;
    
    // Hole Konfiguration für das Modell
    let config = MODEL_CONFIG[model];
    
    // Fallback: Wenn Modell nicht konfiguriert ist
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
        max_tokens: 5000,
        top_p: 0.9,
        frequency_penalty: 0.2,
        presence_penalty: 0.2
      };
    }
    
    // System Prompt hinzufügen (falls vorhanden und noch nicht in messages)
    let processedMessages = [...messages];
    if (config.systemPrompt && !messages.some(m => m.role === 'system')) {
      processedMessages.unshift({
        role: 'system',
        content: config.systemPrompt
      });
    }
    
    // User-Parameter überschreiben Config (falls angegeben)
    const finalConfig = {
      model: config.model,
      messages: processedMessages,
      temperature: temperature !== undefined ? temperature : config.temperature,
      max_tokens: max_tokens !== undefined ? max_tokens : config.max_tokens,
      top_p: top_p !== undefined ? top_p : config.top_p,
      frequency_penalty: frequency_penalty !== undefined ? frequency_penalty : config.frequency_penalty,
      presence_penalty: presence_penalty !== undefined ? presence_penalty : config.presence_penalty,
      extra_body: ENABLE_THINKING_MODE ? { chat_template_kwargs: { thinking: true } } : undefined,
      stream: stream || false
    };
    
    // Make request to NVIDIA NIM API
    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, finalConfig, {
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: stream ? 'stream' : 'json'
    });
    
    if (stream) {
      // Handle streaming response with reasoning
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      let buffer = '';
      let reasoningStarted = false;
      
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
                const reasoning = data.choices[0].delta.reasoning_content;
                const content = data.choices[0].delta.content;
                
                if (SHOW_REASONING) {
                  let combinedContent = '';
                  
                  if (reasoning && !reasoningStarted) {
                    combinedContent = '<think>\n' + reasoning;
                    reasoningStarted = true;
                  } else if (reasoning) {
                    combinedContent = reasoning;
                  }
                  
                  if (content && reasoningStarted) {
                    combinedContent += '</think>\n\n' + content;
                    reasoningStarted = false;
                  } else if (content) {
                    combinedContent += content;
                  }
                  
                  if (combinedContent) {
                    data.choices[0].delta.content = combinedContent;
                    delete data.choices[0].delta.reasoning_content;
                  }
                } else {
                  if (content) {
                    data.choices[0].delta.content = content;
                  } else {
                    data.choices[0].delta.content = '';
                  }
                  delete data.choices[0].delta.reasoning_content;
                }
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
      // Transform NIM response to OpenAI format with reasoning
      const openaiResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: response.data.choices.map(choice => {
          let fullContent = choice.message?.content || '';
          
          if (SHOW_REASONING && choice.message?.reasoning_content) {
            fullContent = '<think>\n' + choice.message.reasoning_content + '\n</think>\n\n' + fullContent;
          }
          
          return {
            index: choice.index,
            message: {
              role: choice.message.role,
              content: fullContent
            },
            finish_reason: choice.finish_reason
          };
        }),
        usage: response.data.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };
      
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

// Catch-all for unsupported endpoints
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
  console.log(`Advanced OpenAI to NVIDIA NIM Proxy running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Configured models: ${Object.keys(MODEL_CONFIG).length}`);
  console.log(`Reasoning display: ${SHOW_REASONING ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Thinking mode: ${ENABLE_THINKING_MODE ? 'ENABLED' : 'DISABLED'}`);
});
