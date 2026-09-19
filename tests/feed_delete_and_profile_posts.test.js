/**
 * FitConnect Feed DELETE & Profile Posts Test Suite
 * Covers all 8 requested test scenarios:
 * 1. GET /profile/me for a user with existing posts -> includes `posts` array with user's own posts, preserving all other fields.
 * 2. POST /social/feed/posts -> creates post, appears in subsequent GET /profile/me `posts` array.
 * 3. DELETE /social/feed/posts/:postId for owned post -> returns { deleted: true }, deleted from posts table.
 * 4. DELETE /social/feed/posts/:postId for post owned by DIFFERENT user -> 404 POST_NOT_FOUND_OR_NOT_OWNER & post STILL EXISTS.
 * 5. DELETE /social/feed/posts/:postId for non-existent post -> 404 POST_NOT_FOUND_OR_NOT_OWNER.
 * 6. Deletion row removal -> deleted post disappears from /profile/me, /social/feed?tab=global, and /social/feed?tab=following.
 * 7. DELETE requires authentication -> 401 returned when called without token before controller.
 * 8. Static check: no raw res.json() calls in feed.controller.js or profile.controller.js.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const express = require('express');

// Config & modules
const env = require('../src/config/env.config');
const db = require('../src/config/db');
const feedModel = require('../src/modules/feed/feed.model');
const feedService = require('../src/modules/feed/feed.service');
const feedController = require('../src/modules/feed/feed.controller');
const feedRoutes = require('../src/modules/feed/feed.routes');
const profileModel = require('../src/modules/profile/profile.model');
const profileService = require('../src/modules/profile/profile.service');
const profileController = require('../src/modules/profile/profile.controller');
const profileRoutes = require('../src/modules/profile/profile.routes');
const authGuard = require('../src/middleware/authGuard');

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING FITCONNECT FEED DELETE & PROFILE POSTS TESTS');
  console.log('======================================================\n');

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

  // ----------------------------------------------------------------
  // Mock Database Store
  // ----------------------------------------------------------------
  let postAutoId = 100;
  const store = {
    users: [
      {
        id: 'u1',
        name: 'Athlete Alpha',
        username: 'alpha_athlete',
        email: 'alpha@fitconnect.test',
        photo_url: 'https://fit.test/alpha.jpg',
        privacy: 'public',
        age: 25,
        weight_kg: 75,
        height_cm: 180,
        activity_level: 'intermediate',
        created_at: new Date(),
      },
      {
        id: 'u2',
        name: 'Athlete Beta',
        username: 'beta_athlete',
        email: 'beta@fitconnect.test',
        photo_url: 'https://fit.test/beta.jpg',
        privacy: 'public',
        age: 28,
        weight_kg: 82,
        height_cm: 185,
        activity_level: 'advanced',
        created_at: new Date(),
      },
    ],
    sports: [
      { id: 1, slug: 'football', name: 'Football' },
    ],
    user_sports: [
      { user_id: 'u1', sport_id: 1, sport_name: 'Football', sport_slug: 'football' },
    ],
    follows: [
      { follower_id: 'u1', following_id: 'u2' }, // u1 follows u2
    ],
    posts: [
      {
        id: 1,
        user_id: 'u1',
        type: 'achievement',
        caption: 'First Alpha post',
        photo_url: null,
        likes_count: 0,
        created_at: new Date(Date.now() - 3600000),
        session_id: null,
        pr_id: null,
      },
      {
        id: 2,
        user_id: 'u2',
        type: 'photo',
        caption: 'Beta Workout Day',
        photo_url: 'https://img.test/beta.jpg',
        likes_count: 5,
        created_at: new Date(Date.now() - 1800000),
        session_id: null,
        pr_id: null,
      },
    ],
    likes: [],
  };

  // Intercept db.query to work against store
  const originalQuery = db.query;
  db.query = async (text, params = []) => {
    const normalized = text.replace(/\s+/g, ' ').trim();

    // 1. DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id
    if (normalized.includes('DELETE FROM posts WHERE id = $1 AND user_id = $2')) {
      const [postId, userId] = params;
      const index = store.posts.findIndex(
        (p) => String(p.id) === String(postId) && String(p.user_id) === String(userId)
      );
      if (index !== -1) {
        const deleted = store.posts.splice(index, 1)[0];
        return { rows: [{ id: deleted.id }] };
      }
      return { rows: [] };
    }

    // 2. INSERT INTO posts
    if (normalized.includes('INSERT INTO posts')) {
      const [userId, type, caption, photoUrl, sessionId, prId] = params;
      postAutoId++;
      const newPost = {
        id: postAutoId,
        user_id: userId,
        type,
        caption: caption ?? null,
        photo_url: photoUrl ?? null,
        session_id: sessionId ?? null,
        pr_id: prId ?? null,
        likes_count: 0,
        created_at: new Date(),
      };
      store.posts.unshift(newPost);
      return { rows: [newPost] };
    }

    // 3. SELECT * FROM posts WHERE id = $1
    if (normalized.includes('SELECT * FROM posts WHERE id = $1')) {
      const [postId] = params;
      const post = store.posts.find((p) => String(p.id) === String(postId));
      return { rows: post ? [post] : [] };
    }

    // 4. SELECT posts by user (getPostsByUser)
    if (normalized.includes('FROM posts WHERE user_id = $1')) {
      const [userId, limit, offset] = params;
      const filtered = store.posts
        .filter((p) => String(p.user_id) === String(userId))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const sliced = filtered.slice(offset || 0, (offset || 0) + (limit || 20));
      return { rows: sliced };
    }

    // 5. Global feed
    if (normalized.includes('FROM posts p JOIN users u ON u.id = p.user_id WHERE u.privacy = \'public\'')) {
      const [limit, offset] = params;
      const publicUsers = new Set(store.users.filter((u) => u.privacy === 'public').map((u) => String(u.id)));
      const filtered = store.posts
        .filter((p) => publicUsers.has(String(p.user_id)))
        .map((p) => {
          const author = store.users.find((u) => String(u.id) === String(p.user_id));
          return {
            ...p,
            author_id: author?.id,
            author_name: author?.name,
            author_username: author?.username,
            author_photo_url: author?.photo_url,
          };
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const sliced = filtered.slice(offset || 0, (offset || 0) + (limit || 20));
      return { rows: sliced };
    }

    // 6. Following feed
    if (normalized.includes('WHERE p.user_id IN ( SELECT following_id FROM follows WHERE follower_id = $3 )')) {
      const [limit, offset, currentUserId] = params;
      const followingIds = new Set(
        store.follows
          .filter((f) => String(f.follower_id) === String(currentUserId))
          .map((f) => String(f.following_id))
      );
      const filtered = store.posts
        .filter((p) => followingIds.has(String(p.user_id)))
        .map((p) => {
          const author = store.users.find((u) => String(u.id) === String(p.user_id));
          return {
            ...p,
            author_id: author?.id,
            author_name: author?.name,
            author_username: author?.username,
            author_photo_url: author?.photo_url,
          };
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const sliced = filtered.slice(offset || 0, (offset || 0) + (limit || 20));
      return { rows: sliced };
    }

    // 7. Profile summary
    if (normalized.includes('FROM users WHERE id = $1')) {
      const [userId] = params;
      const u = store.users.find((user) => String(user.id) === String(userId));
      return { rows: u ? [u] : [] };
    }

    // 8. User sports
    if (normalized.includes('FROM user_sports us JOIN sports s')) {
      const [userId] = params;
      const us = store.user_sports
        .filter((item) => String(item.user_id) === String(userId))
        .map((item) => ({ id: item.sport_id, slug: item.sport_slug, name: item.sport_name }));
      return { rows: us };
    }

    // 9. checkLikedByUser
    if (normalized.includes('SELECT EXISTS( SELECT 1 FROM likes WHERE post_id = $1 AND user_id = $2 )')) {
      const [postId, userId] = params;
      const liked = store.likes.some(
        (l) => String(l.post_id) === String(postId) && String(l.user_id) === String(userId)
      );
      return { rows: [{ liked }] };
    }

    return { rows: [] };
  };

  // Helper response mock
  function createMockRes() {
    return {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };
  }

  // Token generator
  const user1Token = jwt.sign({ userId: 'u1', email: 'alpha@fitconnect.test' }, env.JWT_SECRET || 'test_jwt_secret');
  const user2Token = jwt.sign({ userId: 'u2', email: 'beta@fitconnect.test' }, env.JWT_SECRET || 'test_jwt_secret');

  // Setup express test app
  const testApp = express();
  testApp.use(express.json());
  testApp.use('/api/v1/profile', profileRoutes);
  testApp.use('/api/v1', feedRoutes);

  // Global error handler for test app
  testApp.use((err, req, res, next) => {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message,
      },
    });
  });

  try {
    // ----------------------------------------------------------------
    // Scenario 1: GET /profile/me includes posts array and preserves fields
    // ----------------------------------------------------------------
    await test('Scenario 1: GET /profile/me includes user posts and preserves existing fields', async () => {
      const res = createMockRes();
      const req = {
        user: { id: 'u1' },
        query: { page: '1', limit: '20' },
      };

      await profileController.getMe(req, res, (err) => { throw err; });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      const data = res.body.data;

      // Preserved fields
      assert.strictEqual(data.id, 'u1');
      assert.strictEqual(data.name, 'Athlete Alpha');
      assert.strictEqual(data.username, 'alpha_athlete');
      assert.ok(Array.isArray(data.sports), 'sports must be an array');
      assert.strictEqual(data.sports[0].name, 'Football');

      // New posts field
      assert.ok(Array.isArray(data.posts), 'posts must be an array');
      assert.strictEqual(data.posts.length, 1);
      assert.strictEqual(data.posts[0].caption, 'First Alpha post');
    });

    // ----------------------------------------------------------------
    // Scenario 2: POST /social/feed/posts creates post & appears in GET /profile/me
    // ----------------------------------------------------------------
    let createdPostId = null;
    await test('Scenario 2: POST /social/feed/posts creates post -> appears in subsequent GET /profile/me', async () => {
      const createRes = createMockRes();
      const createReq = {
        user: { id: 'u1' },
        body: {
          type: 'photo',
          caption: 'Morning 10k Run photo',
          photo_url: 'https://fit.test/run.jpg',
        },
      };

      await feedController.create(createReq, createRes, (err) => { throw err; });

      assert.strictEqual(createRes.statusCode, 200);
      assert.strictEqual(createRes.body.success, true);
      assert.ok(createRes.body.data.id, 'Created post must have an id');
      createdPostId = createRes.body.data.id;
      assert.strictEqual(createRes.body.data.caption, 'Morning 10k Run photo');

      // Verify GET /profile/me now has 2 posts
      const getRes = createMockRes();
      const getReq = { user: { id: 'u1' }, query: {} };
      await profileController.getMe(getReq, getRes, (err) => { throw err; });

      assert.strictEqual(getRes.statusCode, 200);
      assert.strictEqual(getRes.body.data.posts.length, 2);
      assert.strictEqual(getRes.body.data.posts[0].id, createdPostId);
      assert.strictEqual(getRes.body.data.posts[0].caption, 'Morning 10k Run photo');
    });

    // ----------------------------------------------------------------
    // Scenario 3: DELETE /social/feed/posts/:postId on owned post
    // ----------------------------------------------------------------
    await test('Scenario 3: DELETE /social/feed/posts/:postId for owned post -> { deleted: true } and deleted from store', async () => {
      const delRes = createMockRes();
      const delReq = {
        user: { id: 'u1' },
        params: { postId: String(createdPostId) },
      };

      await feedController.remove(delReq, delRes, (err) => { throw err; });

      assert.strictEqual(delRes.statusCode, 200);
      assert.strictEqual(delRes.body.success, true);
      assert.deepStrictEqual(delRes.body.data, { deleted: true });

      // Confirm post is removed from store
      const existsInStore = store.posts.some((p) => p.id === createdPostId);
      assert.strictEqual(existsInStore, false, 'Post must no longer exist in store');
    });

    // ----------------------------------------------------------------
    // Scenario 4: DELETE on post owned by DIFFERENT user -> 404 & post STILL EXISTS
    // ----------------------------------------------------------------
    await test('Scenario 4: DELETE on post owned by DIFFERENT user -> 404 POST_NOT_FOUND_OR_NOT_OWNER & post STILL EXISTS', async () => {
      // Post id 2 is owned by user 'u2'
      const targetPostId = 2;
      const initialPostCount = store.posts.length;

      const delRes = createMockRes();
      const delReq = {
        user: { id: 'u1' }, // User 1 tries to delete User 2's post
        params: { postId: String(targetPostId) },
      };

      await feedController.remove(delReq, delRes, (err) => { throw err; });

      assert.strictEqual(delRes.statusCode, 404);
      assert.strictEqual(delRes.body.success, false);
      assert.strictEqual(delRes.body.error.code, 'POST_NOT_FOUND_OR_NOT_OWNER');

      // Confirm post STILL EXISTS in the database store
      const stillExists = store.posts.some((p) => p.id === targetPostId);
      assert.strictEqual(stillExists, true, 'Different user post must NOT be deleted');
      assert.strictEqual(store.posts.length, initialPostCount);
    });

    // ----------------------------------------------------------------
    // Scenario 5: DELETE on non-existent postId -> 404 POST_NOT_FOUND_OR_NOT_OWNER
    // ----------------------------------------------------------------
    await test('Scenario 5: DELETE on non-existent postId -> 404 POST_NOT_FOUND_OR_NOT_OWNER', async () => {
      const delRes = createMockRes();
      const delReq = {
        user: { id: 'u1' },
        params: { postId: '999999' },
      };

      await feedController.remove(delReq, delRes, (err) => { throw err; });

      assert.strictEqual(delRes.statusCode, 404);
      assert.strictEqual(delRes.body.success, false);
      assert.strictEqual(delRes.body.error.code, 'POST_NOT_FOUND_OR_NOT_OWNER');
    });

    // ----------------------------------------------------------------
    // Scenario 6: Deletion row removal verified across profile & feeds
    // ----------------------------------------------------------------
    await test('Scenario 6: Deleted post disappears from /profile/me, global feed, and following feed', async () => {
      // 1. Create a post by u2
      const createRes = createMockRes();
      await feedController.create(
        {
          user: { id: 'u2' },
          body: { type: 'pr', caption: 'Beta New PR' },
        },
        createRes,
        (err) => { throw err; }
      );
      const betaPrPostId = createRes.body.data.id;

      // Confirm visible in global feed and following feed for u1 (who follows u2)
      const feedResBefore = await feedService.getFeed('following', 'u1', 1, 20);
      assert.ok(feedResBefore.some((p) => p.id === betaPrPostId), 'Post must be in following feed');

      // Delete the post as owner (u2)
      const delRes = createMockRes();
      await feedController.remove(
        { user: { id: 'u2' }, params: { postId: String(betaPrPostId) } },
        delRes,
        (err) => { throw err; }
      );
      assert.strictEqual(delRes.statusCode, 200);

      // Verify gone from profile/me of u2
      const profileU2 = await profileService.getProfileHeader('u2', 1, 20);
      assert.strictEqual(profileU2.posts.some((p) => p.id === betaPrPostId), false);

      // Verify gone from global feed
      const globalFeed = await feedService.getFeed('global', 'u1', 1, 20);
      assert.strictEqual(globalFeed.some((p) => p.id === betaPrPostId), false);

      // Verify gone from following feed
      const followingFeed = await feedService.getFeed('following', 'u1', 1, 20);
      assert.strictEqual(followingFeed.some((p) => p.id === betaPrPostId), false);
    });

    // ----------------------------------------------------------------
    // Scenario 7: DELETE requires authentication (authGuard) -> 401
    // ----------------------------------------------------------------
    await test('Scenario 7: DELETE endpoint requires authentication (returns 401 without token)', async () => {
      const req = { headers: {} };
      const res = createMockRes();
      let nextError = null;

      authGuard(req, res, (err) => {
        nextError = err;
      });

      assert.ok(nextError, 'authGuard must call next with error when token missing');
      assert.strictEqual(nextError.statusCode, 401);
      assert.strictEqual(nextError.code, 'UNAUTHORIZED');
    });

    // ----------------------------------------------------------------
    // Scenario 8: Static check for no raw res.json() in controllers
    // ----------------------------------------------------------------
    await test('Scenario 8: Static check confirms no raw res.json() in feed.controller.js or profile.controller.js', async () => {
      const feedControllerPath = path.join(__dirname, '../src/modules/feed/feed.controller.js');
      const profileControllerPath = path.join(__dirname, '../src/modules/profile/profile.controller.js');

      const feedContent = fs.readFileSync(feedControllerPath, 'utf8');
      const profileContent = fs.readFileSync(profileControllerPath, 'utf8');

      // Check for raw res.json(
      const rawResJsonFeed = /res\.json\s*\(/.test(feedContent);
      const rawResJsonProfile = /res\.json\s*\(/.test(profileContent);

      assert.strictEqual(rawResJsonFeed, false, 'feed.controller.js must not contain raw res.json()');
      assert.strictEqual(rawResJsonProfile, false, 'profile.controller.js must not contain raw res.json()');

      // Check for sendSuccess and sendError usage
      assert.ok(feedContent.includes('sendSuccess'), 'feed.controller.js must use sendSuccess');
      assert.ok(feedContent.includes('sendError'), 'feed.controller.js must use sendError');
      assert.ok(profileContent.includes('sendSuccess'), 'profile.controller.js must use sendSuccess');
    });

  } finally {
    // Restore db.query
    db.query = originalQuery;
  }

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passed}/${total} TESTS PASSED SUCCESSFULLY!`);
  console.log('======================================================\n');
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test execution terminated with failure:', err);
  process.exit(1);
});
