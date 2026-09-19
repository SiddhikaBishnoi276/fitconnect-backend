/**
 * FitConnect Feed Module - Comprehensive Test Suite
 * Covers all 15 verification scenarios:
 * 1. POST /social/feed/posts/draft with valid session_id -> returns draft_caption & writes nothing to posts table
 * 2. POST /social/feed/posts/draft on LLM failure/timeout -> returns fallback caption with 200
 * 3. POST /social/feed/posts with type='photo', caption, photo_url -> row created in posts
 * 4. POST /social/feed/posts with invalid type -> 400 INVALID_POST_TYPE
 * 5. POST /social/feed/posts with caption > 500 chars -> 400 CAPTION_TOO_LONG
 * 6. GET /social/feed?tab=global -> public user posts appear, private user posts do NOT appear
 * 7. GET /social/feed?tab=following -> followed private user posts appear; non-followed user posts do NOT appear
 * 8. Feed responses include liked_by_me boolean correctly reflecting like status
 * 9. POST /social/feed/posts/:postId/like -> row in likes & posts.likes_count incremented by 1 via DB trigger
 * 10. Like same post twice -> idempotent, likes_count not incremented again
 * 11. DELETE /social/feed/posts/:postId/like -> row removed from likes & likes_count decremented by 1
 * 12. Unlike post never liked -> idempotent, no error
 * 13. Like/unlike/draft on non-existent postId or session_id -> proper 404/400 error handling, not raw 500
 * 14. Static check: feed.controller.js uses ONLY sendSuccess / sendError (no raw res.json)
 * 15. Static check: feed.model.js contains no manual UPDATE statement on posts.likes_count (trigger only)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const app = require('../src/app');
const db = require('../src/config/db');
const { generateAuthTokens } = require('../src/modules/auth/auth.service');
const llmClient = require('../src/llm/llmClient');

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING FITCONNECT FEED MODULE TEST SUITE');
  console.log('======================================================\n');

  let server;
  let baseUrl;

  // Start HTTP server on random available port
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}/api/v1`;
      resolve();
    });
  });

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error('   Error:', err.message);
      if (err.stack) console.error('   Stack:', err.stack.split('\n').slice(1, 4).join('\n'));
      throw err;
    }
  }

  // Helper HTTP caller
  async function apiCall(endpoint, { method = 'GET', token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    return { status: response.status, body: data };
  }

  const timestamp = Date.now();
  let user1 = null; // Public user
  let user1Token = null;
  let user2 = null; // Private user
  let user2Token = null;
  let user3 = null; // Follower / Viewer
  let user3Token = null;
  let testSessionId = null;
  let testPostId = null;

  try {
    // ----------------------------------------------------------------
    // Setup Test Users, Sports, Plans, and Sessions
    // ----------------------------------------------------------------
    const suffix = Math.floor(Math.random() * 89999 + 10000);
    const u1Res = await db.query(`
      INSERT INTO users (name, username, email, age, weight_kg, height_cm, gender, activity_level, equipment, privacy)
      VALUES ('Public Athlete', 'pub_ath_${suffix}', 'pub_${suffix}@test.fit', 25, 75.0, 180.0, 'male', 'intermediate', 'gym', 'public')
      RETURNING id, username;
    `);
    user1 = u1Res.rows[0];
    user1Token = generateAuthTokens(user1.id).accessToken;

    const u2Res = await db.query(`
      INSERT INTO users (name, username, email, age, weight_kg, height_cm, gender, activity_level, equipment, privacy)
      VALUES ('Private Athlete', 'priv_ath_${suffix}', 'priv_${suffix}@test.fit', 28, 68.0, 175.0, 'female', 'advanced', 'gym', 'private')
      RETURNING id, username;
    `);
    user2 = u2Res.rows[0];
    user2Token = generateAuthTokens(user2.id).accessToken;

    const u3Res = await db.query(`
      INSERT INTO users (name, username, email, age, weight_kg, height_cm, gender, activity_level, equipment, privacy)
      VALUES ('Viewer Athlete', 'viewer_${suffix}', 'view_${suffix}@test.fit', 30, 80.0, 182.0, 'male', 'beginner', 'home', 'public')
      RETURNING id, username;
    `);
    user3 = u3Res.rows[0];
    user3Token = generateAuthTokens(user3.id).accessToken;

    // Create a plan and session for User 1
    const sportRes = await db.query(`SELECT id FROM sports LIMIT 1;`);
    const sportId = sportRes.rows[0]?.id || 1;

    const planRes = await db.query(`
      INSERT INTO plans (user_id, week_start_date, status)
      VALUES ($1, CURRENT_DATE, 'active')
      RETURNING id;
    `, [user1.id]);
    const planId = planRes.rows[0].id;

    const planDayRes = await db.query(`
      INSERT INTO plan_days (plan_id, day_index, sport_id, session_type, estimated_duration_min, intensity)
      VALUES ($1, 1, $2, 'Heavy Strength + Sprints', 50, 'high')
      RETURNING id;
    `, [planId, sportId]);
    const planDayId = planDayRes.rows[0].id;

    const sessionRes = await db.query(`
      INSERT INTO sessions (user_id, plan_day_id, date, status, duration_min, exercises_completed, fully_completed)
      VALUES ($1, $2, CURRENT_DATE, 'completed', 52, 6, true)
      RETURNING id;
    `, [user1.id, planDayId]);
    testSessionId = sessionRes.rows[0].id;

    // ----------------------------------------------------------------
    // 14. Static check: Controller uses ONLY sendSuccess / sendError
    // ----------------------------------------------------------------
    await test('14. Static check: feed.controller.js uses ONLY sendSuccess / sendError (no raw res.json)', () => {
      const controllerPath = path.join(__dirname, '../src/modules/feed/feed.controller.js');
      const content = fs.readFileSync(controllerPath, 'utf8');
      assert.strictEqual(content.includes('res.json('), false, 'feed.controller.js must not contain raw res.json() calls');
      assert.strictEqual(content.includes('sendSuccess('), true, 'feed.controller.js must use sendSuccess');
      assert.strictEqual(content.includes('sendError('), true, 'feed.controller.js must use sendError');
    });

    // ----------------------------------------------------------------
    // 15. Static check: feed.model.js does not manually update likes_count
    // ----------------------------------------------------------------
    await test('15. Static check: feed.model.js contains NO manual UPDATE touching posts.likes_count', () => {
      const modelPath = path.join(__dirname, '../src/modules/feed/feed.model.js');
      const content = fs.readFileSync(modelPath, 'utf8');
      const regex = /UPDATE\s+posts\s+SET.*likes_count/i;
      assert.strictEqual(regex.test(content), false, 'feed.model.js must not manually update likes_count');
    });

    // ----------------------------------------------------------------
    // 1. POST /social/feed/posts/draft
    // ----------------------------------------------------------------
    await test('1. POST /social/feed/posts/draft returns draft_caption & writes NOTHING to posts table', async () => {
      const countBeforeRes = await db.query(`SELECT COUNT(*)::int AS count FROM posts;`);
      const countBefore = countBeforeRes.rows[0].count;

      const res = await apiCall('/social/feed/posts/draft', {
        method: 'POST',
        token: user1Token,
        body: { session_id: testSessionId },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.draft_caption, 'draft_caption should exist');
      assert.strictEqual(typeof res.body.data.draft_caption, 'string');
      assert.strictEqual(res.body.data.session_id, testSessionId);

      const countAfterRes = await db.query(`SELECT COUNT(*)::int AS count FROM posts;`);
      const countAfter = countAfterRes.rows[0].count;
      assert.strictEqual(countAfter, countBefore, 'Posts table count should not change after drafting caption');
    });

    // ----------------------------------------------------------------
    // 2. POST /social/feed/posts/draft LLM fallback
    // ----------------------------------------------------------------
    await test('2. POST /social/feed/posts/draft graceful fallback on LLM failure/timeout', async () => {
      const origGenerate = llmClient.generate;
      try {
        llmClient.generate = async () => {
          throw new Error('LLM connection timeout');
        };

        const res = await apiCall('/social/feed/posts/draft', {
          method: 'POST',
          token: user1Token,
          body: { session_id: testSessionId },
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.draft_caption, 'Just finished a great session! 💪');
      } finally {
        llmClient.generate = origGenerate;
      }
    });

    // ----------------------------------------------------------------
    // 3. POST /social/feed/posts
    // ----------------------------------------------------------------
    await test('3. POST /social/feed/posts with type=photo creates valid post row', async () => {
      const res = await apiCall('/social/feed/posts', {
        method: 'POST',
        token: user1Token,
        body: {
          type: 'photo',
          caption: 'Morning workout complete! #fitlife',
          photo_url: 'https://example.com/photo.jpg',
          session_id: testSessionId,
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.type, 'photo');
      assert.strictEqual(res.body.data.caption, 'Morning workout complete! #fitlife');
      assert.strictEqual(res.body.data.photo_url, 'https://example.com/photo.jpg');
      assert.strictEqual(res.body.data.likes_count, 0);
      testPostId = res.body.data.id;

      // Verify in DB directly
      const dbPostRes = await db.query(`SELECT * FROM posts WHERE id = $1`, [testPostId]);
      assert.strictEqual(dbPostRes.rows.length, 1);
      assert.strictEqual(dbPostRes.rows[0].caption, 'Morning workout complete! #fitlife');
    });

    // ----------------------------------------------------------------
    // 4. POST /social/feed/posts invalid type
    // ----------------------------------------------------------------
    await test('4. POST /social/feed/posts with invalid type returns 400 INVALID_POST_TYPE', async () => {
      const res = await apiCall('/social/feed/posts', {
        method: 'POST',
        token: user1Token,
        body: {
          type: 'random_invalid_type',
          caption: 'Testing invalid type',
        },
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'INVALID_POST_TYPE');
    });

    // ----------------------------------------------------------------
    // 5. POST /social/feed/posts caption too long
    // ----------------------------------------------------------------
    await test('5. POST /social/feed/posts with caption > 500 chars returns 400 CAPTION_TOO_LONG', async () => {
      const longCaption = 'A'.repeat(501);
      const res = await apiCall('/social/feed/posts', {
        method: 'POST',
        token: user1Token,
        body: {
          type: 'session_complete',
          caption: longCaption,
        },
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'CAPTION_TOO_LONG');
    });

    // ----------------------------------------------------------------
    // 6. GET /social/feed?tab=global privacy filtering
    // ----------------------------------------------------------------
    let privatePostId = null;
    await test('6. GET /social/feed?tab=global filters out private user posts and shows public posts', async () => {
      // Create post from private user (User 2)
      const privPostRes = await apiCall('/social/feed/posts', {
        method: 'POST',
        token: user2Token,
        body: {
          type: 'achievement',
          caption: 'Private athlete secret achievement',
        },
      });
      assert.strictEqual(privPostRes.status, 200);
      privatePostId = privPostRes.body.data.id;

      // Fetch global feed as User 3
      const feedRes = await apiCall('/social/feed?tab=global', {
        method: 'GET',
        token: user3Token,
      });

      assert.strictEqual(feedRes.status, 200);
      assert.strictEqual(feedRes.body.success, true);
      const postIds = feedRes.body.data.map(p => p.id);
      assert.ok(postIds.includes(testPostId), 'Public user post should appear in global feed');
      assert.strictEqual(postIds.includes(privatePostId), false, 'Private user post MUST NOT appear in global feed');
    });

    // ----------------------------------------------------------------
    // 7. GET /social/feed?tab=following
    // ----------------------------------------------------------------
    await test('7. GET /social/feed?tab=following shows posts from followed private user', async () => {
      // User 3 follows User 2 (private)
      await db.query(`
        INSERT INTO follows (follower_id, following_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING;
      `, [user3.id, user2.id]);

      // Fetch following feed as User 3
      const feedRes = await apiCall('/social/feed?tab=following', {
        method: 'GET',
        token: user3Token,
      });

      assert.strictEqual(feedRes.status, 200);
      assert.strictEqual(feedRes.body.success, true);
      const postIds = feedRes.body.data.map(p => p.id);
      assert.ok(postIds.includes(privatePostId), 'Followed private user post should appear in following feed');
      assert.strictEqual(postIds.includes(testPostId), false, 'Unfollowed public user post should not appear in following feed');
    });

    // ----------------------------------------------------------------
    // 8. Feed liked_by_me boolean annotation
    // ----------------------------------------------------------------
    await test('8. Feed posts include liked_by_me boolean correctly reflecting like status', async () => {
      // User 3 likes testPostId
      await db.query(`
        INSERT INTO likes (post_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING;
      `, [testPostId, user3.id]);

      const feedRes = await apiCall('/social/feed?tab=global', {
        method: 'GET',
        token: user3Token,
      });

      const targetPost = feedRes.body.data.find(p => p.id === testPostId);
      assert.ok(targetPost, 'Target post must exist in feed');
      assert.strictEqual(targetPost.liked_by_me, true, 'liked_by_me should be true for post liked by user');

      // Check for user 1 (who has not liked this post yet)
      const feedResUser1 = await apiCall('/social/feed?tab=global', {
        method: 'GET',
        token: user1Token,
      });

      const targetPostUser1 = feedResUser1.body.data.find(p => p.id === testPostId);
      assert.strictEqual(targetPostUser1.liked_by_me, false, 'liked_by_me should be false for post not liked by user');

      // Cleanup like
      await db.query(`DELETE FROM likes WHERE post_id = $1 AND user_id = $2;`, [testPostId, user3.id]);
    });

    // ----------------------------------------------------------------
    // 9. POST /social/feed/posts/:postId/like
    // ----------------------------------------------------------------
    await test('9. POST /social/feed/posts/:postId/like adds row & increments likes_count via trigger', async () => {
      const res = await apiCall(`/social/feed/posts/${testPostId}/like`, {
        method: 'POST',
        token: user3Token,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.liked, true);

      // Verify row in likes table
      const likeRow = await db.query(`SELECT * FROM likes WHERE post_id = $1 AND user_id = $2;`, [testPostId, user3.id]);
      assert.strictEqual(likeRow.rows.length, 1);

      // Verify posts.likes_count incremented
      const postRow = await db.query(`SELECT likes_count FROM posts WHERE id = $1;`, [testPostId]);
      assert.strictEqual(Number(postRow.rows[0].likes_count), 1);
    });

    // ----------------------------------------------------------------
    // 10. Like same post twice (idempotency)
    // ----------------------------------------------------------------
    await test('10. Liking same post twice is idempotent and does NOT increment likes_count again', async () => {
      const res = await apiCall(`/social/feed/posts/${testPostId}/like`, {
        method: 'POST',
        token: user3Token,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.liked, true);

      const postRow = await db.query(`SELECT likes_count FROM posts WHERE id = $1;`, [testPostId]);
      assert.strictEqual(Number(postRow.rows[0].likes_count), 1, 'likes_count must remain 1');
    });

    // ----------------------------------------------------------------
    // 11. DELETE /social/feed/posts/:postId/like
    // ----------------------------------------------------------------
    await test('11. DELETE /social/feed/posts/:postId/like removes row and decrements likes_count via trigger', async () => {
      const res = await apiCall(`/social/feed/posts/${testPostId}/like`, {
        method: 'DELETE',
        token: user3Token,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.liked, false);

      const likeRow = await db.query(`SELECT * FROM likes WHERE post_id = $1 AND user_id = $2;`, [testPostId, user3.id]);
      assert.strictEqual(likeRow.rows.length, 0);

      const postRow = await db.query(`SELECT likes_count FROM posts WHERE id = $1;`, [testPostId]);
      assert.strictEqual(Number(postRow.rows[0].likes_count), 0, 'likes_count must decrement back to 0');
    });

    // ----------------------------------------------------------------
    // 12. Unlike post never liked (idempotency)
    // ----------------------------------------------------------------
    await test('12. Unliking a post never liked is idempotent without error', async () => {
      const res = await apiCall(`/social/feed/posts/${testPostId}/like`, {
        method: 'DELETE',
        token: user1Token,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.liked, false);
    });

    // ----------------------------------------------------------------
    // 13. Error handling on non-existent postId / session_id
    // ----------------------------------------------------------------
    await test('13. Non-existent postId/sessionId returns 404 error cleanly (not raw 500)', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';

      // 1. Like non-existent post -> 404 POST_NOT_FOUND
      const likeRes = await apiCall(`/social/feed/posts/${fakeUuid}/like`, {
        method: 'POST',
        token: user1Token,
      });
      assert.strictEqual(likeRes.status, 404);
      assert.strictEqual(likeRes.body.success, false);
      assert.strictEqual(likeRes.body.error.code, 'POST_NOT_FOUND');

      // 2. Draft caption for non-existent session -> 404 SESSION_NOT_FOUND
      const draftRes = await apiCall('/social/feed/posts/draft', {
        method: 'POST',
        token: user1Token,
        body: { session_id: fakeUuid },
      });
      assert.strictEqual(draftRes.status, 404);
      assert.strictEqual(draftRes.body.success, false);
      assert.strictEqual(draftRes.body.error.code, 'SESSION_NOT_FOUND');
    });

    console.log('\n======================================================');
    console.log(`🎉 ALL ${passed}/${total} TESTS PASSED SUCCESSFULLY!`);
    console.log('======================================================\n');
  } finally {
    // Cleanup created test records
    if (user1) {
      await db.query(`DELETE FROM users WHERE id IN ($1, $2, $3);`, [user1.id, user2?.id, user3?.id]);
    }
    if (server) {
      server.close();
    }
  }
}

// Execute tests
runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Test suite failed:', err);
    process.exit(1);
  });
