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

module.exports = {
  isGeminiConfigured,
  generateText,
  generateJSON,
};
