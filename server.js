// HTTP server entrypoint & port listener
const app = require('./src/app');
const env = require('./src/config/env.config');

const PORT = env.PORT || 5000;

app.listen(PORT, () => {
  console.log("FitConnect Backend server running on port " + PORT);
});
