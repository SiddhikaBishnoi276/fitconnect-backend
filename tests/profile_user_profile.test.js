/**
 * FitConnect - GET /profile/:userId Comprehensive Test Suite
 * Covers all 11 requested scenarios:
 * 1. Valid existing user with posts & PRs -> all expected fields present
 * 2. User followed by current user -> is_following: true
 * 3. User who follows current user -> is_followed_by: true
 * 4. User with zero posts -> posts: [] (empty array)
 * 5. User with zero PRs -> prs: [] (empty array)
 * 6. Non-existent userId -> 404 USER_NOT_FOUND
 * 7. User with privacy = 'private' -> full profile returned unconditionally (no gating)
 * 8. Regression: GET /profile/me works as expected
 * 9. Route precedence: /profile/me and /profile/records not intercepted as :userId
 * 10. Static check: no raw res.json() in profile.controller.js
 * 11. Pagination on posts: ?page=1&limit=5 and ?page=2&limit=5 return disjoint slices
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const express = require('express');

const env = require('../src/config/env.config');
const db = require('../src/config/db');
const profileRoutes = require('../src/modules/profile/profile.routes');
const profileController = require('../src/modules/profile/profile.controller');
const profileService = require('../src/modules/profile/profile.service');

async function runProfileUserTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING FITCONNECT GET /profile/:userId TEST SUITE');
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

  // In-memory data store for tests
  const store = {
    users: [
      {
        id: 'u_tester',
        name: 'Current Tester',
        username: 'curr_tester',
        photo_url: 'https://fit.test/tester.jpg',
        tier: 'silver',
        current_streak: 5,
        longest_streak: 12,
        rp_total: 1200,
        privacy: 'public',
      },
      {
        id: 'u_target_full',
        name: 'Target Athlete',
        username: 'target_athlete',
        photo_url: 'https://fit.test/target.jpg',
        tier: 'gold',
        current_streak: 14,
        longest_streak: 30,
        rp_total: 4500,
        privacy: 'public',
      },
      {
        id: 'u_empty',
        name: 'Empty Athlete',
        username: 'empty_athlete',
        photo_url: null,
        tier: 'bronze',
        current_streak: 0,
        longest_streak: 0,
        rp_total: 0,
        privacy: 'public',
      },
      {
        id: 'u_private',
        name: 'Private Athlete',
        username: 'private_athlete',
        photo_url: 'https://fit.test/private.jpg',
        tier: 'platinum',
        current_streak: 20,
        longest_streak: 45,
        rp_total: 8000,
        privacy: 'private',
      },
      {
        id: 'u_paginated',
        name: 'Paginated Athlete',
        username: 'paged_athlete',
        photo_url: null,
        tier: 'silver',
        current_streak: 3,
        longest_streak: 10,
        rp_total: 500,
        privacy: 'public',
      },
    ],
    user_sports: [
      { user_id: 'u_tester', sport_id: 1, sport_name: 'Running', sport_slug: 'running' },
      { user_id: 'u_target_full', sport_id: 1, sport_name: 'Running', sport_slug: 'running' },
      { user_id: 'u_target_full', sport_id: 2, sport_name: 'Swimming', sport_slug: 'swimming' },
      { user_id: 'u_private', sport_id: 2, sport_name: 'Swimming', sport_slug: 'swimming' },
    ],
    follows: [
      { follower_id: 'u_tester', following_id: 'u_target_full' }, // Tester follows target
      { follower_id: 'u_target_full', following_id: 'u_tester' }, // Target follows tester back
    ],
    prs: [
      {
        id: 101,
        user_id: 'u_target_full',
        exercise_id: 1,
        metric: 'time_sec',
        value: 120,
        previous_best: 130,
        verification_status: 'verified',
        exercise_name: '500m Sprint',
        sport_id: 1,
        created_at: new Date('2026-09-01'),
      },
      {
        id: 102,
        user_id: 'u_tester',
        exercise_id: 2,
        metric: 'reps',
        value: 25,
        previous_best: 20,
        verification_status: 'verified',
        exercise_name: 'Pullups',
        sport_id: 1,
        created_at: new Date('2026-09-02'),
      },
      {
        id: 103,
        user_id: 'u_private',
        exercise_id: 3,
        metric: 'kg',
        value: 140,
        previous_best: 135,
        verification_status: 'verified',
        exercise_name: 'Bench Press',
        sport_id: 2,
        created_at: new Date('2026-09-03'),
      },
    ],
    posts: [
      {
        id: 201,
        user_id: 'u_target_full',
        type: 'achievement',
        caption: 'Gold tier reached!',
        photo_url: null,
        likes_count: 10,
        created_at: new Date('2026-09-10'),
      },
      {
        id: 202,
        user_id: 'u_target_full',
        type: 'photo',
        caption: 'Track session',
        photo_url: 'https://fit.test/track.jpg',
        likes_count: 4,
        created_at: new Date('2026-09-11'),
      },
      {
        id: 203,
        user_id: 'u_private',
        type: 'pr',
        caption: 'New bench record!',
        photo_url: null,
        likes_count: 2,
        created_at: new Date('2026-09-12'),
      },
      {
        id: 204,
        user_id: 'u_tester',
        type: 'photo',
        caption: 'Tester own post',
        photo_url: null,
        likes_count: 0,
        created_at: new Date('2026-09-13'),
      },
    ],
  };

  // Populate 8 posts for u_paginated
  for (let i = 1; i <= 8; i++) {
    store.posts.push({
      id: 300 + i,
      user_id: 'u_paginated',
      type: 'photo',
      caption: `Paginated post ${i}`,
      photo_url: null,
      likes_count: i,
      created_at: new Date(Date.now() - (10 - i) * 60000), // newer post has higher id
    });
  }

  // Intercept db.query
  const originalQuery = db.query;
  db.query = async (text, params = []) => {
    const normalized = text.replace(/\s+/g, ' ').trim();

    // 1. getPublicProfile: SELECT id, name, username, photo_url, tier, current_streak, longest_streak, rp_total FROM users WHERE id = $1
    if (normalized.includes('SELECT id, name, username, photo_url, tier, current_streak, longest_streak, rp_total FROM users WHERE id = $1')) {
      const [userId] = params;
      const u = store.users.find((user) => String(user.id) === String(userId));
      if (u) {
        return {
          rows: [{
            id: u.id,
            name: u.name,
            username: u.username,
            photo_url: u.photo_url,
            tier: u.tier,
            current_streak: u.current_streak,
            longest_streak: u.longest_streak,
            rp_total: u.rp_total,
          }],
        };
      }
      return { rows: [] };
    }

    // 2. getUserProfileSummary: SELECT id, name, photo_url, tier, rp_total, current_streak, privacy FROM users WHERE id = $1
    if (normalized.includes('SELECT id, name, photo_url, tier, rp_total, current_streak, privacy FROM users WHERE id = $1')) {
      const [userId] = params;
      const u = store.users.find((user) => String(user.id) === String(userId));
      return { rows: u ? [u] : [] };
    }

    // 3. getUserSports: SELECT s.id, us.sport_id, s.slug, s.name FROM user_sports us JOIN sports s ON us.sport_id = s.id WHERE us.user_id = $1
    if (normalized.includes('FROM user_sports us JOIN sports s')) {
      const [userId] = params;
      const sports = store.user_sports
        .filter((us) => String(us.user_id) === String(userId))
        .map((us) => ({ id: us.sport_id, sport_id: us.sport_id, slug: us.sport_slug, name: us.sport_name }));
      return { rows: sports };
    }

    // 4. isFollowing: SELECT EXISTS ( SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 )
    if (normalized.includes('SELECT EXISTS ( SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 )') ||
        normalized.includes('SELECT EXISTS( SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 )')) {
      const [followerId, followingId] = params;
      const following = store.follows.some(
        (f) => String(f.follower_id) === String(followerId) && String(f.following_id) === String(followingId)
      );
      return { rows: [{ following }] };
    }

    // 5. getUserPRs: SELECT prs.id ... FROM prs JOIN exercises ... WHERE prs.user_id = $1
    if (normalized.includes('FROM prs JOIN exercises ON prs.exercise_id = exercises.id WHERE prs.user_id = $1') ||
        normalized.includes('WHERE prs.user_id = $1')) {
      const [userId] = params;
      const userPrs = store.prs.filter((pr) => String(pr.user_id) === String(userId));
      return { rows: userPrs };
    }

    // 6. getUserPersonalRecords (for /records endpoint)
    if (normalized.includes('SELECT DISTINCT ON (p.exercise_id)')) {
      const [userId] = params;
      const userPrs = store.prs.filter((pr) => String(pr.user_id) === String(userId));
      return { rows: userPrs };
    }

    // 7. getPostsByUser: FROM posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3
    if (normalized.includes('FROM posts WHERE user_id = $1')) {
      const [userId, limit, offset] = params;
      const userPosts = store.posts
        .filter((p) => String(p.user_id) === String(userId))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const sliced = userPosts.slice(offset || 0, (offset || 0) + (limit || 20));
      return { rows: sliced };
    }

    return { rows: [] };
  };

  // Setup express test app with authentication simulation
  const app = express();
  app.use(express.json());

  // Test middleware attaching req.user
  app.use((req, res, next) => {
    req.user = { id: 'u_tester' };
    next();
  });

  app.use('/profile', profileRoutes);

  // Global error handler
  app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message,
      },
    });
  });

  // Helper response mock for direct controller tests
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

  try {
    // ----------------------------------------------------------------
    // Scenario 1: Valid user with posts and PRs -> full fields
    // ----------------------------------------------------------------
    await test('Scenario 1: GET /profile/:userId returns full profile structure with all required fields', async () => {
      const res = createMockRes();
      const req = {
        user: { id: 'u_tester' },
        params: { userId: 'u_target_full' },
        query: { page: '1', limit: '20' },
      };

      await profileController.getUserProfile(req, res, (err) => { throw err; });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      const data = res.body.data;

      // Verify all specified fields
      assert.strictEqual(data.id, 'u_target_full');
      assert.strictEqual(data.name, 'Target Athlete');
      assert.strictEqual(data.username, 'target_athlete');
      assert.strictEqual(data.photo_url, 'https://fit.test/target.jpg');
      assert.strictEqual(data.tier, 'gold');
      assert.strictEqual(data.current_streak, 14);
      assert.strictEqual(data.longest_streak, 30);
      assert.strictEqual(data.rp_total, 4500);

      assert.ok(Array.isArray(data.sports), 'sports must be an array');
      assert.strictEqual(data.sports.length, 2);

      assert.strictEqual(typeof data.is_following, 'boolean');
      assert.strictEqual(typeof data.is_followed_by, 'boolean');

      assert.ok(Array.isArray(data.prs), 'prs must be an array');
      assert.strictEqual(data.prs.length, 1);

      assert.ok(Array.isArray(data.posts), 'posts must be an array');
      assert.strictEqual(data.posts.length, 2);
    });

    // ----------------------------------------------------------------
    // Scenario 2: is_following: true when tester follows target
    // ----------------------------------------------------------------
    await test('Scenario 2: is_following is true when current user follows target', async () => {
      const res = createMockRes();
      const req = {
        user: { id: 'u_tester' },
        params: { userId: 'u_target_full' },
        query: {},
      };

      await profileController.getUserProfile(req, res, (err) => { throw err; });
      assert.strictEqual(res.body.data.is_following, true);
    });

    // ----------------------------------------------------------------
    // Scenario 3: is_followed_by: true when target follows tester back
    // ----------------------------------------------------------------
    await test('Scenario 3: is_followed_by is true when target follows current user back', async () => {
      const res = createMockRes();
      const req = {
        user: { id: 'u_tester' },
        params: { userId: 'u_target_full' },
        query: {},
      };

      await profileController.getUserProfile(req, res, (err) => { throw err; });
      assert.strictEqual(res.body.data.is_followed_by, true);

      // Verify false for user who does not follow
      const res2 = createMockRes();
      await profileController.getUserProfile(
        { user: { id: 'u_tester' }, params: { userId: 'u_empty' }, query: {} },
        res2,
        (err) => { throw err; }
      );
      assert.strictEqual(res2.body.data.is_following, false);
      assert.strictEqual(res2.body.data.is_followed_by, false);
    });

    // ----------------------------------------------------------------
    // Scenario 4: User with zero posts -> posts: []
    // ----------------------------------------------------------------
    await test('Scenario 4: User with zero posts returns posts: [] (empty array, not null/error)', async () => {
      const res = createMockRes();
      const req = {
        user: { id: 'u_tester' },
        params: { userId: 'u_empty' },
        query: {},
      };

      await profileController.getUserProfile(req, res, (err) => { throw err; });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.data.posts), 'posts must be an array');
      assert.strictEqual(res.body.data.posts.length, 0);
    });

    // ----------------------------------------------------------------
    // Scenario 5: User with zero PRs -> prs: []
    // ----------------------------------------------------------------
    await test('Scenario 5: User with zero PRs returns prs: [] (empty array, not null/error)', async () => {
      const res = createMockRes();
      const req = {
        user: { id: 'u_tester' },
        params: { userId: 'u_empty' },
        query: {},
      };

      await profileController.getUserProfile(req, res, (err) => { throw err; });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.data.prs), 'prs must be an array');
      assert.strictEqual(res.body.data.prs.length, 0);
    });

    // ----------------------------------------------------------------
    // Scenario 6: Non-existent userId -> 404 USER_NOT_FOUND
    // ----------------------------------------------------------------
    await test('Scenario 6: Non-existent userId returns 404 with USER_NOT_FOUND error code', async () => {
      const res = createMockRes();
      const req = {
        user: { id: 'u_tester' },
        params: { userId: 'e9b2c3d4-0000-4000-a000-000000000000' },
        query: {},
      };

      await profileController.getUserProfile(req, res, (err) => { throw err; });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'USER_NOT_FOUND');
    });

    // ----------------------------------------------------------------
    // Scenario 7: Privacy column set to 'private' -> full profile returned unconditionally
    // ----------------------------------------------------------------
    await test('Scenario 7: Private user profile returns complete data with NO gating or hidden fields', async () => {
      // Find private user
      const privateUser = store.users.find((u) => u.id === 'u_private');
      assert.strictEqual(privateUser.privacy, 'private');

      const res = createMockRes();
      const req = {
        user: { id: 'u_tester' },
        params: { userId: 'u_private' },
        query: {},
      };

      await profileController.getUserProfile(req, res, (err) => { throw err; });
      assert.strictEqual(res.statusCode, 200);
      const data = res.body.data;

      // Confirm all data is returned without gating
      assert.strictEqual(data.id, 'u_private');
      assert.strictEqual(data.name, 'Private Athlete');
      assert.strictEqual(data.tier, 'platinum');
      assert.strictEqual(data.rp_total, 8000);
      assert.strictEqual(data.sports.length, 1);
      assert.strictEqual(data.prs.length, 1);
      assert.strictEqual(data.posts.length, 1);
    });

    // ----------------------------------------------------------------
    // Scenario 8: GET /profile/me regression check
    // ----------------------------------------------------------------
    await test('Scenario 8: GET /profile/me continues to work normally and was unaffected', async () => {
      const res = createMockRes();
      const req = {
        user: { id: 'u_tester' },
        query: { page: '1', limit: '20' },
      };

      await profileController.getMe(req, res, (err) => { throw err; });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.id, 'u_tester');
      assert.strictEqual(res.body.data.name, 'Current Tester');
      assert.ok(Array.isArray(res.body.data.posts), 'posts must be present in profile/me');
    });

    // ----------------------------------------------------------------
    // Scenario 9: Route ordering: /me and /records are NOT matched as :userId
    // ----------------------------------------------------------------
    await test('Scenario 9: Route ordering ensures /me and /records match their specific handlers, not :userId', async () => {
      // Simulate request routing through profileRoutes router stack
      const routesList = [];
      profileRoutes.stack.forEach((layer) => {
        if (layer.route) {
          const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
          routesList.push({ path: layer.route.path, method: methods });
        }
      });

      const paths = routesList.map((r) => r.path);
      const userIdIndex = paths.indexOf('/:userId');
      const meIndex = paths.indexOf('/me');
      const recordsIndex = paths.indexOf('/records');

      assert.ok(userIdIndex !== -1, '/:userId route must exist');
      assert.ok(meIndex !== -1, '/me route must exist');
      assert.ok(recordsIndex !== -1, '/records route must exist');

      assert.ok(userIdIndex > meIndex, '/:userId must come AFTER /me in route registration');
      assert.ok(userIdIndex > recordsIndex, '/:userId must come AFTER /records in route registration');
      assert.strictEqual(userIdIndex, paths.length - 1, '/:userId must be the very last registered route');
    });

    // ----------------------------------------------------------------
    // Scenario 10: Response formatter check: no raw res.json()
    // ----------------------------------------------------------------
    await test('Scenario 10: Static analysis verifies no raw res.json() in profile.controller.js', async () => {
      const controllerPath = path.join(__dirname, '../src/modules/profile/profile.controller.js');
      const content = fs.readFileSync(controllerPath, 'utf8');

      const hasRawJson = /res\.json\s*\(/.test(content);
      assert.strictEqual(hasRawJson, false, 'profile.controller.js must not contain raw res.json()');
      assert.ok(content.includes('sendSuccess'), 'profile.controller.js must use sendSuccess');
      assert.ok(content.includes('sendError'), 'profile.controller.js must use sendError');
    });

    // ----------------------------------------------------------------
    // Scenario 11: Pagination on posts
    // ----------------------------------------------------------------
    await test('Scenario 11: Pagination on posts with page=1&limit=5 and page=2&limit=5 returns disjoint slices', async () => {
      // Page 1
      const resPage1 = createMockRes();
      await profileController.getUserProfile(
        { user: { id: 'u_tester' }, params: { userId: 'u_paginated' }, query: { page: '1', limit: '5' } },
        resPage1,
        (err) => { throw err; }
      );
      assert.strictEqual(resPage1.statusCode, 200);
      const page1Posts = resPage1.body.data.posts;
      assert.strictEqual(page1Posts.length, 5, 'Page 1 must contain exactly 5 posts');

      // Page 2
      const resPage2 = createMockRes();
      await profileController.getUserProfile(
        { user: { id: 'u_tester' }, params: { userId: 'u_paginated' }, query: { page: '2', limit: '5' } },
        resPage2,
        (err) => { throw err; }
      );
      assert.strictEqual(resPage2.statusCode, 200);
      const page2Posts = resPage2.body.data.posts;
      assert.strictEqual(page2Posts.length, 3, 'Page 2 must contain remaining 3 posts');

      // Verify no overlap between pages
      const page1Ids = new Set(page1Posts.map((p) => p.id));
      const page2Ids = new Set(page2Posts.map((p) => p.id));
      for (const id of page2Ids) {
        assert.strictEqual(page1Ids.has(id), false, `Post ID ${id} appeared on both page 1 and page 2`);
      }

      // Verify total distinct posts fetched equals 8
      assert.strictEqual(page1Posts.length + page2Posts.length, 8);
    });

  } finally {
    db.query = originalQuery;
  }

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passed}/${total} TESTS PASSED SUCCESSFULLY!`);
  console.log('======================================================\n');
}

runProfileUserTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
