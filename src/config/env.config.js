// Validated environment configuration helper
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database / Neon DB connection
  DATABASE_URL: process.env.DATABASE_URL,
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT, 10) || 5432,
  DB_NAME: process.env.DB_NAME || 'fitconnect_db',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || '',

  // Auth / JWT
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',

  // LLM / AI Configuration
  LLM_PROVIDER: process.env.LLM_PROVIDER || 'gemini',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,

  // Firebase Admin SDK (Push Notifications)
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,

  // Email / SMTP Configuration (Nodemailer)
  SMTP_HOST: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT, 10) || 465,
  SMTP_SECURE: (process.env.SMTP_SECURE || process.env.EMAIL_SECURE) === 'true' || (parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT, 10) === 465) || (!process.env.SMTP_PORT && !process.env.EMAIL_PORT),
  SMTP_USER: process.env.SMTP_USER || process.env.EMAIL_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || process.env.EMAIL_PASS || '',
  EMAIL_FROM: process.env.EMAIL_FROM || (process.env.SMTP_USER ? `"FitConnect" <${process.env.SMTP_USER}>` : '"FitConnect" <noreply@fitconnect.com>'),
};

module.exports = env;
