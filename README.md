# FitConnect Backend API

FitConnect is an AI-driven fitness and sports coaching platform featuring adaptive workout generation, real-time feedback, gamification, and anti-cheat verification.

## Tech Stack
- **Runtime:** Node.js (v20+)
- **Framework:** Express.js
- **Database:** PostgreSQL
- **AI / LLM:** Google Gemini / OpenAI
- **Push Notifications:** Firebase Cloud Messaging (FCM)

## Architecture Overview
The backend follows a domain-driven modular structure where each feature lives in its own module inside `src/modules/` with:
- `<module>.controller.js` - Request handling and HTTP response formatting
- `<module>.service.js` - Business logic and orchestration
- `<module>.routes.js` - Express route definitions
- `<module>.model.js` - Database queries and data access layer
- `<module>.prompts.js` (optional) - Specialized LLM prompts for AI-driven features

## Getting Started
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Start development server
npm run dev
```
