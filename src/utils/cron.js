const cron = require('node-cron');
const rankingModel = require('../modules/ranking/ranking.model');

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    console.log('[CRON] Refreshing leaderboard_snapshot...');
    await rankingModel.refreshLeaderboard();
    console.log('[CRON] Leaderboard refreshed successfully.');
  } catch (error) {
    console.error('[CRON] Error refreshing leaderboard:', error.message);
  }
});

console.log('[CRON] Cron jobs initialized.');
