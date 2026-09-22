// Centralized Gemini API caller & error retry logic
const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../config/env.config');

const isGeminiConfigured = () => {
  return (
    env.GEMINI_API_KEY &&
    !env.GEMINI_API_KEY.includes('your_gemini_api_key_here')
  );
};

let genAI = null;
if (isGeminiConfigured()) {
  genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
}

const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest'];

/**
 * Generate plain text response from Gemini with fallback support
 * @param {string} prompt
 * @param {object} [options]
 * @param {string} [options.modelName]
 * @param {number} [options.temperature=0.7]
 * @returns {Promise<string>}
 */
const generateText = async (prompt, options = {}) => {
  if (!isGeminiConfigured()) {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }

  const modelCandidates = options.modelName ? [options.modelName, ...FALLBACK_MODELS] : FALLBACK_MODELS;
  let lastError = null;

  for (const modelName of modelCandidates) {
    let retries = 3;
    while (retries > 0) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxOutputTokens ?? 2048,
          },
        });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      } catch (error) {
        lastError = error;
        if (retries > 1) {
          console.warn(`⚠️ [Gemini Retry] ${modelName} failed. Retrying in 6s... (${retries - 1} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 6000));
          retries--;
        } else {
          console.warn(`⚠️ [Gemini Model Switch - ${modelName} failed]: ${error.message}. Trying next candidate if available...`);
          break;
        }
      }
    }
  }

  console.error('❌ [Gemini Error - All candidates failed]:', lastError?.message);
  throw lastError;
};

/**
 * Generate structured JSON response from Gemini with fallback support
 * Ideal for structured workout plans, diets, evaluations
 * @param {string} prompt
 * @param {object} [options]
 * @param {string} [options.modelName]
 * @param {object} [options.schema]
 * @returns {Promise<any>}
 */
const generateJSON = async (prompt, options = {}) => {
  if (!isGeminiConfigured()) {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }

  const modelCandidates = options.modelName ? [options.modelName, ...FALLBACK_MODELS] : FALLBACK_MODELS;
  let lastError = null;

  const generationConfig = {
    responseMimeType: 'application/json',
    temperature: options.temperature ?? 0.4,
  };

  if (options.schema) {
    generationConfig.responseSchema = options.schema;
  }

  for (const modelName of modelCandidates) {
    let retries = 3;
    while (retries > 0) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig,
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return JSON.parse(text);
      } catch (error) {
        lastError = error;
        if (retries > 1) {
          console.warn(`⚠️ [Gemini Retry] ${modelName} failed. Retrying in 6s... (${retries - 1} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 6000));
          retries--;
        } else {
          console.warn(`⚠️ [Gemini Model Switch - ${modelName} failed]: ${error.message}. Trying next candidate if available...`);
          break;
        }
      }
    }
  }

  console.error('❌ [Gemini JSON Error - All candidates failed]:', lastError?.message);
  throw lastError;
};

/**
 * Unified generate function for system + user prompts
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} [options]
 * @param {boolean} [options.expectJSON=false]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ json?: any, text?: string }>}
 */
const generate = async (systemPrompt, userPrompt, options = {}) => {
  const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;

  const callPromise = (async () => {
    if (options.expectJSON) {
      const json = await generateJSON(combinedPrompt, options);
      return { json };
    }
    const text = await generateText(combinedPrompt, options);
    return { text };
  })();

  if (options.timeoutMs && options.timeoutMs > 0) {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`LLM call timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
    });
    try {
      const res = await Promise.race([callPromise, timeoutPromise]);
      clearTimeout(timeoutHandle);
      return res;
    } catch (err) {
      clearTimeout(timeoutHandle);
      throw err;
    }
  }

  return await callPromise;
};

module.exports = {
  isGeminiConfigured,
  generateText,
  generateJSON,
  generate,
};

