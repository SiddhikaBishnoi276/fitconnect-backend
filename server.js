// HTTP server entrypoint & port listener
const app = require('./src/app');
const env = require('./src/config/env.config');
const { testConnection } = require('./src/config/db');

const PORT = env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`FitConnect Backend server running on port ${PORT}`);
  try {
    await testConnection();
  } catch (err) {
    console.error('⚠️ Database check error on boot:', err.message);
  }
});

