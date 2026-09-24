// Express application setup, global middlewares & base routing
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const planRoutes = require('./modules/plan/plan.routes');
const sessionRoutes = require('./modules/session/session.routes');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');

const app = express();

// Trust reverse proxy headers (Required for Render, Heroku, AWS, Nginx to get real client IP)
app.set('trust proxy', 1);

// Security & Parsing Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes (supports both /api/v1/sessions and /sessions directly)
app.use('/api/v1', routes);
app.use('/plans', planRoutes);
app.use('/sessions', sessionRoutes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
