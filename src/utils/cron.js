const cron = require('node-cron');
const rankingModel = require('../modules/ranking/ranking.model');

const db = require('../config/db');

// Run every 5 minutes (Leaderboard Refresh)
cron.schedule('*/5 * * * *', async () => {
  try {
    console.log('[CRON] Refreshing leaderboard_snapshot...');
    await rankingModel.refreshLeaderboard();
    console.log('[CRON] Leaderboard refreshed successfully.');
  } catch (error) {
    console.error('[CRON] Error refreshing leaderboard:', error.message);
  }
});

// Run daily at 3:00 AM (30-day Data Cleanup)
cron.schedule('0 3 * * *', async () => {
  try {
    console.log('[CRON] Starting 30-day data cleanup...');
    const result = await db.query(`
      DELETE FROM plans 
      WHERE created_at < NOW() - INTERVAL '30 days'
      RETURNING id;
    `);
    console.log(`[CRON] Cleanup complete. Deleted ${result.rowCount} old plans (cascading to sessions and exercises).`);
  } catch (error) {
    console.error('[CRON] Error during data cleanup:', error.message);
  }
});

console.log('[CRON] Cron jobs initialized.');
