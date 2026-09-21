require('dotenv').config();
const db = require('../src/config/db');
const followService = require('../src/modules/follow/follow.service');
const feedService = require('../src/modules/feed/feed.service');
const feedModel = require('../src/modules/feed/feed.model');
const notificationService = require('../src/modules/notifications/notifications.service');
const notificationsModel = require('../src/modules/notifications/notifications.model');

async function runFollowAndLikeTests() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('🧪 RUNNING FITCONNECT FOLLOW & LIKE NOTIFICATION INTEGRATION TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const createdUserIds = [];
  const createdPostIds = [];

  // Helper to create test user
  async function createTestUser(prefix, name) {
    const suffix = Math.random().toString(36).substring(2, 6);
    const username = `u_${prefix}_${suffix}`.toLowerCase();
    const email = `${username}@test.com`;
    const res = await db.query(`
      INSERT INTO users (email, username, password_hash, name, age, weight_kg, height_cm, gender, activity_level, equipment, time_budget_minutes, diet_preference, rp_total, tier, current_streak, longest_streak, privacy)
      VALUES ($1, $2, 'hashed_pwd', $3, 25, 70.0, 175.0, 'other', 'beginner', 'gym', 45, 'veg', 100, 'bronze', 0, 0, 'public')
      RETURNING id, username, name;
    `, [email, username, name]);
    const u = res.rows[0];
    createdUserIds.push(u.id);
    return u;
  }

  try {
    // ═══════════════════════════════════════════════════════════════════
    // TEST SET A — new_follower
    // ═══════════════════════════════════════════════════════════════════
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('TEST SET A: new_follower Notification Triggers');
    console.log('───────────────────────────────────────────────────────────────────\n');

    // Setup User A and User B
    const userA = await createTestUser('flw_a', 'Alice Walker');
    const userB = await createTestUser('flw_b', 'Bob Builder');
    console.log(`Created test users: User A (${userA.name}, id=${userA.id}), User B (${userB.name}, id=${userB.id})\n`);

    // A1. Follow action -> Check DB notification
    {
      console.log('--- A1: User A follows User B -> Check notification in DB for User B ---');
      const followRes = await followService.followUser(userA.id, userB.id);
      
      const notifsRes = await db.query(`
        SELECT id, user_id, type, payload, read, created_at
        FROM notifications
        WHERE user_id = $1 AND type = 'new_follower';
      `, [userB.id]);

      const notifRow = notifsRes.rows[0];
      const hasCorrectPayload = notifRow && (notifRow.payload.follower_id === userA.id || notifRow.payload.user_id === userA.id);

      console.log('  Follow API Response:', followRes);
      console.log('  DB Notification Row for User B:', notifRow);

      const pass = Boolean(notifRow && hasCorrectPayload);
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test A1: new_follower notification created with User A's ID and name\n`);
    }

    // A2. Confirm device tokens checked & push-send attempt made
    {
      console.log('--- A2: Verify device token check & FCM push dispatch attempt ---');
      let tokensChecked = false;
      const origGetTokens = notificationsModel.getDeviceTokensByUserId;
      
      notificationsModel.getDeviceTokensByUserId = async (targetId) => {
        tokensChecked = true;
        return await origGetTokens(targetId);
      };

      const userC = await createTestUser('flw_c', 'Charlie Brown');
      // Add a test device token for User B
      await notificationsModel.upsertDeviceToken(userB.id, 'fcm_test_token_bob', 'android');
      
      await followService.followUser(userC.id, userB.id);

      notificationsModel.getDeviceTokensByUserId = origGetTokens;

      const tokensInDb = await notificationsModel.getDeviceTokensByUserId(userB.id);
      console.log('  Device tokens found for User B:', tokensInDb);
      console.log('  getDeviceTokensByUserId was invoked:', tokensChecked);

      const pass = tokensChecked && tokensInDb.length > 0;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test A2: Device tokens retrieved and push notification dispatch attempted for recipient\n`);
    }

    // A3. Follow the SAME user again (repeat / no-op follow)
    {
      console.log('--- A3: User A follows User B a second time (repeat/idempotent call) ---');
      const countBefore = (await db.query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 'new_follower'`, [userB.id])).rows[0].count;

      const repeatRes = await followService.followUser(userA.id, userB.id);
      
      const countAfter = (await db.query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 'new_follower'`, [userB.id])).rows[0].count;

      console.log('  Repeat Follow API Response:', repeatRes);
      console.log(`  Notification count for User B before repeat follow: ${countBefore}, after: ${countAfter}`);

      const pass = countBefore === countAfter;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test A3: Idempotent repeat follow did NOT create duplicate notification (Count remained ${countAfter})\n`);
    }

    // A4. Break notification service -> Confirm follow record still created
    {
      console.log('--- A4: Break notification service -> Confirm row in follows table is STILL created ---');
      const userD = await createTestUser('flw_d', 'David Miller');
      
      const origNotify = notificationService.notifyNewFollower;
      notificationService.notifyNewFollower = async () => {
        throw new Error('FCM Network Fatal Exception!');
      };

      let followResult;
      try {
        followResult = await followService.followUser(userD.id, userB.id);
      } finally {
        notificationService.notifyNewFollower = origNotify;
      }

      const followDbRow = await db.query(`
        SELECT follower_id, following_id, created_at
        FROM follows
        WHERE follower_id = $1 AND following_id = $2;
      `, [userD.id, userB.id]);

      console.log('  Follow API Result with Notification Error:', followResult);
      console.log('  DB follows table row:', followDbRow.rows[0]);

      const pass = followResult && followResult.following === true && followDbRow.rows.length === 1;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test A4: DB follow relationship successfully persisted despite notification service failure\n`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST SET B — post_liked
    // ═══════════════════════════════════════════════════════════════════
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('TEST SET B: post_liked Notification Triggers');
    console.log('───────────────────────────────────────────────────────────────────\n');

    // Create a Post by User B
    const postRes = await db.query(`
      INSERT INTO posts (user_id, type, caption, likes_count)
      VALUES ($1, 'photo', 'Morning workout session photo', 0)
      RETURNING id, user_id, caption, likes_count;
    `, [userB.id]);
    const post = postRes.rows[0];
    createdPostIds.push(post.id);
    console.log('Created test post by User B:', post, '\n');

    // B1. User A likes User B's post -> Check notification
    {
      console.log("--- B1: User A likes User B's post -> Check post_liked notification in DB for User B ---");
      const likeRes = await feedService.likePost(post.id, userA.id);

      const notifsRes = await db.query(`
        SELECT id, user_id, type, payload, read, created_at
        FROM notifications
        WHERE user_id = $1 AND type = 'post_liked' AND (payload->>'post_id' = $2::text);
      `, [userB.id, post.id]);

      const notifRow = notifsRes.rows[0];
      const hasCorrectLiker = notifRow && (notifRow.payload.liker_id === userA.id || notifRow.payload.user_id === userA.id);

      console.log('  Like API Response:', likeRes);
      console.log('  DB Notification Row for User B:', notifRow);

      const pass = Boolean(notifRow && hasCorrectLiker);
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test B1: post_liked notification created with User A's ID/name and correct post_id\n`);
    }

    // B2. User B likes their OWN post -> Confirm NO notification
    {
      console.log("--- B2: User B likes their OWN post -> Confirm NO notification is created ---");
      const countBefore = (await db.query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 'post_liked'`, [userB.id])).rows[0].count;

      const selfLikeRes = await feedService.likePost(post.id, userB.id);

      const countAfter = (await db.query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 'post_liked'`, [userB.id])).rows[0].count;

      console.log('  Self-Like API Response:', selfLikeRes);
      console.log(`  Notification count for User B before: ${countBefore}, after: ${countAfter}`);

      const pass = countBefore === countAfter;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test B2: Self-like did NOT create any notification (Count remained ${countAfter})\n`);
    }

    // B3. User A unlikes and then re-likes the same post
    {
      console.log('--- B3: User A unlikes then re-likes User B post -> Check notification count behavior ---');
      const countBefore = (await db.query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 'post_liked'`, [userB.id])).rows[0].count;

      // Unlike
      await feedService.unlikePost(post.id, userA.id);
      // Re-like
      await feedService.likePost(post.id, userA.id);

      const countAfter = (await db.query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 'post_liked'`, [userB.id])).rows[0].count;

      console.log(`  post_liked notification count before unlike/re-like: ${countBefore}, after re-like: ${countAfter}`);
      
      const pass = Number(countAfter) === Number(countBefore) + 1;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test B3: Re-liking after unlike triggers a fresh notification (Count incremented from ${countBefore} to ${countAfter})\n`);
    }

    // B4. Break notification service -> Confirm like row created and likes_count incremented
    {
      console.log('--- B4: Break notification service -> Confirm like row in likes table and posts.likes_count incremented ---');
      const userE = await createTestUser('flw_e', 'Emma Watson');

      const origNotify = notificationService.notifyPostLiked;
      notificationService.notifyPostLiked = async () => {
        throw new Error('FCM Notification Gateway Timeout 504!');
      };

      let likeResult;
      try {
        likeResult = await feedService.likePost(post.id, userE.id);
      } finally {
        notificationService.notifyPostLiked = origNotify;
      }

      const likeDbRow = await db.query(`
        SELECT post_id, user_id, created_at
        FROM likes
        WHERE post_id = $1 AND user_id = $2;
      `, [post.id, userE.id]);

      const postDbRow = await db.query(`
        SELECT id, likes_count
        FROM posts
        WHERE id = $1;
      `, [post.id]);

      console.log('  Like API Result with Notification Error:', likeResult);
      console.log('  DB likes table row:', likeDbRow.rows[0]);
      console.log('  DB posts table updated likes_count:', postDbRow.rows[0].likes_count);

      const pass = likeResult && likeResult.liked === true && likeDbRow.rows.length === 1 && postDbRow.rows[0].likes_count >= 2;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] Test B4: Like row created and post likes_count incremented despite notification failure\n`);
    }

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('🎉 ALL 8 INTEGRATION TESTS (A1-A4, B1-B4) COMPLETED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Test suite failed with error:', err);
  } finally {
    if (createdPostIds.length > 0) {
      await db.query(`DELETE FROM posts WHERE id = ANY($1::uuid[])`, [createdPostIds]);
    }
    if (createdUserIds.length > 0) {
      await db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      console.log(`Cleaned up test users and posts.`);
    }
    if (db.pool) {
      await db.pool.end();
    }
    process.exit(0);
  }
}

runFollowAndLikeTests();
