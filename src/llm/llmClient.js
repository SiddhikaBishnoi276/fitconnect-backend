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

/**
 * Generate plain text response from Gemini
 * @param {string} prompt
 * @param {object} [options]
 * @param {string} [options.modelName="gemini-1.5-flash"]
 * @param {number} [options.temperature=0.7]
 * @returns {Promise<string>}
 */
const generateText = async (prompt, options = {}) => {
  if (!isGeminiConfigured()) {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }

  const modelName = options.modelName || 'gemini-1.5-flash';
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 2048,
    },
  });

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error(`❌ [Gemini Error - ${modelName}]:`, error.message);
    throw error;
  }
};

/**
 * Generate structured JSON response from Gemini
 * Ideal for structured workout plans, diets, evaluations
 * @param {string} prompt
 * @param {object} [options]
 * @param {string} [options.modelName="gemini-1.5-flash"]
 * @param {object} [options.schema]
 * @returns {Promise<any>}
 */
const generateJSON = async (prompt, options = {}) => {
  if (!isGeminiConfigured()) {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }

  const modelName = options.modelName || 'gemini-1.5-flash';
  const generationConfig = {
    responseMimeType: 'application/json',
    temperature: options.temperature ?? 0.4,
  };

  if (options.schema) {
    generationConfig.responseSchema = options.schema;
  }

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig,
  });

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return JSON.parse(text);
  } catch (error) {
    console.error(`❌ [Gemini JSON Error - ${modelName}]:`, error.message);
    throw error;
  }
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

