/**
 * Client Gemini côté serveur (@google/genai).
 * Utilise uniquement process.env.GEMINI_API_KEY côté serveur (jamais exposée au navigateur).
 * Modèles utilisés (compatibles niveau standard sans facturation forcée) :
 *  - gemini-4-hydrogen : analyse multimodale, audit bioclimatique, notice architecturale/CCTP, scripts voix off
 *  - gemini-3.8-flash-lite-tts : synthèse vocale naturelle WAV 24 kHz pour narration architecturale
 */

const fs = require('fs');
const path = require('path');

const TEXT_MODEL = 'gemini-4-hydrogen';
const TTS_MODEL = 'gemini-3.8-flash-lite-tts';
const ALLOWED_VOICES = new Set(['Charon', 'Kore', 'Zephyr', 'Puck', 'Fenrir']);

let cachedSdk = null;
let cachedClient = null;
let cachedKey = '';

function resolveGeminiKey(rootDir = __dirname) {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }
  const localEnv = path.join(rootDir, '.env');
  if (fs.existsSync(localEnv)) {
    try {
      const raw = fs.readFileSync(localEnv, 'utf8');
      const match = raw.match(/^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\r\n#]*))/m);
      const val = match && (match[1] ?? match[2] ?? match[3]);
      if (val && val.trim()) return val.trim();
    } catch { /* fichier local illisible */ }
  }
  return '';
}

function isConfigured(rootDir = __dirname) {
  return Boolean(resolveGeminiKey(rootDir));
}

async function getClient(rootDir = __dirname) {
  const apiKey = resolveGeminiKey(rootDir);
  if (!apiKey) {
    const err = new Error('Clé GEMINI_API_KEY non configurée sur le serveur.');
    err.statusCode = 401;
    throw err;
  }
  if (!cachedSdk) {
    cachedSdk = await import('@google/genai');
  }
  if (!cachedClient || cachedKey !== apiKey) {
    const { GoogleGenAI } = cachedSdk;
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
    cachedKey = apiKey;
  }
  return cachedClient;
}

async function generateText({ prompt, systemInstruction = '', imageDataUrl = '', responseMimeType = '' }) {
  const ai = await getClient();
  const parts = [];
  if (imageDataUrl) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(String(imageDataUrl).trim());
    if (match) {
      parts.push({
        inlineData: {
          mimeType: match[1].toLowerCase(),
          data: match[2]
        }
      });
    }
  }
  parts.push({ text: String(prompt || '').trim() });

  const config = {};
  if (systemInstruction) config.systemInstruction = String(systemInstruction);
  if (responseMimeType) config.responseMimeType = responseMimeType;

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: { parts },
    ...(Object.keys(config).length ? { config } : {})
  });
  const text = (response && typeof response.text === 'string') ? response.text.trim() : '';
  if (!text) {
    const err = new Error('Réponse vide retournée par Gemini.');
    err.statusCode = 502;
    throw err;
  }
  return { text, model: TEXT_MODEL };
}

async function generateSpeechWav({ text, voiceName = 'Charon', style = 'Voix d’architecte française posée, chaleureuse, claire et inspirante pour présenter une résidence contemporaine.' }) {
  const cleanText = String(text || '').trim().slice(0, 4000);
  if (!cleanText) {
    const err = new Error('Le texte de la voix off est vide.');
    err.statusCode = 400;
    throw err;
  }
  const safeVoice = ALLOWED_VOICES.has(voiceName) ? voiceName : 'Charon';
  const ai = await getClient();
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: cleanText,
            speechMetadata: {
              style: String(style || '').slice(0, 240)
            }
          }
        ]
      }
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: safeVoice }
        }
      }
    }
  });

  const base64Audio = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    const err = new Error('Gemini TTS n’a pas renvoyé de flux audio WAV.');
    err.statusCode = 502;
    throw err;
  }
  const wavBuffer = Buffer.from(base64Audio, 'base64');
  return { wavBuffer, voiceName: safeVoice, model: TTS_MODEL };
}

module.exports = {
  TEXT_MODEL,
  TTS_MODEL,
  ALLOWED_VOICES,
  resolveGeminiKey,
  isConfigured,
  generateText,
  generateSpeechWav
};
