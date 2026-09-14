-- ============================================================================
-- FitConnect — PostgreSQL Schema (v2 — reconciled with Master Spec)
-- ============================================================================
-- Design principles used throughout:
--   1. UUID primary keys everywhere (gen_random_uuid()), EXCEPT small,
--      slow-growing reference/lookup tables (e.g. sports) where a SERIAL
--      integer is simpler and there is no external-exposure concern.
--   2. ENUM types for small fixed vocabularies (gender, tier, feedback, etc.)
--      — the DB rejects a bad value instead of the app having to check.
--   3. Real foreign keys + UNIQUE constraints everywhere a relationship or a
--      "only once" rule exists (e.g. one vote per user per PR) — this is the
--      main reason Postgres was chosen over Mongo for this app: those rules
--      are enforced by the database itself, not by application code that can
--      have bugs.
--   4. JSONB only where the shape genuinely varies (plan-generation context,
--      notification payloads) — everything else is proper columns so it can
--      be indexed, filtered and joined normally.
--   5. Triggers keep denormalized counters (users.rp_total, posts.likes_count,
--      prs.genuine_votes/flag_votes) in sync automatically, in the same
--      transaction as the write that caused them — no background job needed.
--
-- CONFIRMED PRODUCT DECISIONS (v2, reconciled with Master Spec):
--   - Anchor sport is REMOVED entirely. Every sport a user selects has equal
--     scheduling priority — no anchor/primary sport concept anywhere.
--   - Social feed is NOT "factual cards only" — it supports photo + caption
--     (Instagram-style), and reactions are called "likes" (not "kudos").
--   - RP is earned ONLY from streaks + full-session-completion. PRs never
--     contribute RP (keeps the RP economy resistant to PR-gaming).
--   - Equipment is a 2-value choice: 'gym' or 'home' — 'home' itself means
--     bodyweight / no-equipment training, so there is no separate 'none'.
--   - gender is mandatory (NOT NULL) — not optional.
--   - GPS/sensor verification and statistical trust-scoring are explicitly
--     OUT OF SCOPE for MVP (deferred). Only community-flagging / crowd
--     voting (pr_votes) is implemented now.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- for gen_random_uuid()

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE auth_provider_enum   AS ENUM ('email', 'google', 'apple');
CREATE TYPE gender_enum          AS ENUM ('male', 'female', 'other');                 -- mandatory field, no NULL allowed
CREATE TYPE activity_level_enum  AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE equipment_enum       AS ENUM ('gym', 'home');           -- 'home' = bodyweight/no-equipment training; there is no separate 'none' value
CREATE TYPE diet_preference_enum AS ENUM ('veg', 'non_veg', 'vegan', 'eggetarian');
CREATE TYPE recovery_status_enum AS ENUM ('fully_healed', 'mostly_recovered', 'partially_recovered', 'ongoing');
CREATE TYPE privacy_enum         AS ENUM ('public', 'private');
CREATE TYPE tier_enum            AS ENUM ('bronze', 'silver', 'gold', 'elite');
CREATE TYPE plan_status_enum     AS ENUM ('active', 'completed', 'superseded');
CREATE TYPE intensity_enum       AS ENUM ('low', 'medium', 'high');
CREATE TYPE session_status_enum  AS ENUM ('in_progress', 'completed');
CREATE TYPE feedback_enum        AS ENUM ('too_easy', 'just_right', 'too_hard', 'skipped');
CREATE TYPE rp_type_enum         AS ENUM ('session_completion', 'streak_milestone');   -- NOTE: intentionally no 'pr' value — PRs never grant RP
CREATE TYPE meal_slot_enum       AS ENUM ('breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout');
CREATE TYPE post_type_enum       AS ENUM ('pr', 'achievement', 'photo', 'session_complete');
CREATE TYPE vote_enum            AS ENUM ('genuine', 'flag');
CREATE TYPE pr_verification_enum AS ENUM ('unverified', 'genuine', 'disputed');
CREATE TYPE notification_type_enum AS ENUM ('post_liked', 'streak_milestone', 'tier_promotion', 'followed_user_pr', 'pr_disputed');
CREATE TYPE device_platform_enum AS ENUM ('ios', 'android', 'web');
CREATE TYPE sleep_quality_enum AS ENUM ('good', 'ok', 'poor');
CREATE TYPE soreness_enum      AS ENUM ('none', 'some', 'sore');
CREATE TYPE energy_enum        AS ENUM ('fresh', 'normal', 'tired');


-- ============================================================================
-- LOOKUP: sports
-- ============================================================================
-- A proper table (not an enum) because this list will grow post-launch
-- without a schema migration. SERIAL id is fine here — small, slow-growing
-- reference table, never exposed as a sensitive/guessable identifier.

CREATE TABLE sports (
  id    SERIAL PRIMARY KEY,
  slug  TEXT UNIQUE NOT NULL,        -- 'football', 'gym', 'swimming', ...
  name  TEXT NOT NULL
);

-- ============================================================================
-- USERS
-- ============================================================================

CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  email                 TEXT UNIQUE NOT NULL,
  phone                 TEXT,
  auth_provider         auth_provider_enum NOT NULL DEFAULT 'email',
  password_hash         TEXT,                       -- null if google/apple auth
  photo_url             TEXT,

  age                   SMALLINT NOT NULL CHECK (age > 0 AND age < 100),
  weight_kg             NUMERIC(5,2) NOT NULL CHECK (weight_kg > 0),
  height_cm             NUMERIC(5,2) NOT NULL CHECK (height_cm > 0),
  gender                gender_enum NOT NULL,                     -- mandatory, confirmed
  activity_level        activity_level_enum NOT NULL,

  equipment             equipment_enum NOT NULL,                  -- 'home' already implies no-equipment training
  time_budget_minutes   SMALLINT NOT NULL,
  preferred_days        SMALLINT[] NOT NULL DEFAULT '{}',         -- 1=Mon ... 7=Sun
  goals                 TEXT[] NOT NULL DEFAULT '{}',             -- 'strength','weight_loss','endurance', etc.

  diet_preference       diet_preference_enum NOT NULL,
  regional_cuisine      TEXT,

  rp_total              INT NOT NULL DEFAULT 0,
  tier                  tier_enum NOT NULL DEFAULT 'bronze',
  current_streak        INT NOT NULL DEFAULT 0,
  longest_streak        INT NOT NULL DEFAULT 0,

  privacy               privacy_enum NOT NULL DEFAULT 'public',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_leaderboard ON users (tier, rp_total DESC);

-- --- user_sports ------------------------------------------------------------
-- Every sport a user selects has EQUAL priority — no anchor/primary sport
-- column, confirmed removed entirely. Plain many-to-many join table.

CREATE TABLE user_sports (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sport_id  INT  NOT NULL REFERENCES sports(id),
  PRIMARY KEY (user_id, sport_id)
);

-- --- user_injuries -----------------------------------------------------------

CREATE TABLE user_injuries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body_part             TEXT NOT NULL,             -- 'knee_left', 'shoulder_right', ...
  condition             TEXT NOT NULL,              -- 'ACL_tear', 'sprain', ...
  occurred_months_ago   INT,
  recovery_status       recovery_status_enum NOT NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_injuries_user ON user_injuries (user_id);

-- ============================================================================
-- EXERCISE LIBRARY (master/reference data)
-- ============================================================================

CREATE TABLE exercises (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  sport_id                    INT REFERENCES sports(id),     -- null = general/cross-sport
  load_tags                   TEXT[] NOT NULL DEFAULT '{}',  -- 'legs_high', 'core_medium', ...
  default_sets                SMALLINT,
  default_reps_min            SMALLINT,
  default_reps_max            SMALLINT,
  demo_media_url              TEXT,
  contraindicated_body_parts  TEXT[] NOT NULL DEFAULT '{}'    -- used by the injury filter
);

CREATE INDEX idx_exercises_sport ON exercises (sport_id);
CREATE INDEX idx_exercises_load_tags ON exercises USING GIN (load_tags);
CREATE INDEX idx_exercises_contraindications ON exercises USING GIN (contraindicated_body_parts);

CREATE TABLE exercise_substitutes (
  exercise_id             UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  substitute_exercise_id  UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  PRIMARY KEY (exercise_id, substitute_exercise_id)
);

-- ============================================================================
-- PLANS (the AI-generated 7-day plan)
-- ============================================================================

CREATE TABLE plans (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start_date      DATE NOT NULL,
  status               plan_status_enum NOT NULL DEFAULT 'active',
  generation_context   JSONB,     -- snapshot the AI used (injuries at generation time,
                                   -- last week's too-hard/skipped areas) — shape varies,
                                   -- kept as JSONB rather than more tables since it's
                                   -- write-once, debug-only data, never queried by field.
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start_date)
);

CREATE INDEX idx_plans_user_status ON plans (user_id, status);

CREATE TABLE plan_days (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                  UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  day_index                SMALLINT NOT NULL CHECK (day_index BETWEEN 1 AND 7),
  sport_id                 INT REFERENCES sports(id),
  session_type             TEXT NOT NULL,          -- 'Upper Body Strength + Recovery Swim'
  estimated_duration_min   SMALLINT,
  intensity                intensity_enum NOT NULL,
  UNIQUE (plan_id, day_index)
);

CREATE TABLE plan_day_exercises (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_day_id            UUID NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
  exercise_id            UUID NOT NULL REFERENCES exercises(id),
  order_index            SMALLINT NOT NULL,
  target_sets            SMALLINT,
  target_reps_min        SMALLINT,
  target_reps_max        SMALLINT,
  is_substituted         BOOLEAN NOT NULL DEFAULT false,
  substitution_reason    TEXT                       -- e.g. "avoided due to left knee ACL"
);

CREATE INDEX idx_plan_day_exercises_day ON plan_day_exercises (plan_day_id, order_index);

-- ============================================================================
-- SESSIONS (the daily training loop)
-- ============================================================================

CREATE TABLE sessions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_day_id                 UUID NOT NULL REFERENCES plan_days(id),
  date                        DATE NOT NULL,
  status                      session_status_enum NOT NULL DEFAULT 'in_progress',

  -- pre-session check-in
  sleep_quality               sleep_quality_enum,
 soreness soreness_enum, -- 'none', 'some', 'sore' 
energy energy_enum, -- 'fresh', 'normal', 'tired' 
  new_discomfort_present      BOOLEAN NOT NULL DEFAULT false,
  new_discomfort_body_part    TEXT,

  -- summary (filled in when status -> completed)
  duration_min                INT,
  exercises_completed         SMALLINT,
  adapted_count                SMALLINT,
  skipped_count                SMALLINT,
  fully_completed              BOOLEAN NOT NULL DEFAULT false,   -- drives RP eligibility

  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at                 TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user_date ON sessions (user_id, date DESC);
CREATE INDEX idx_sessions_user_status ON sessions (user_id, status);

CREATE TABLE session_exercise_feedback (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id             UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  exercise_id            UUID NOT NULL REFERENCES exercises(id),
  order_index            SMALLINT NOT NULL,
  target_reps_min        SMALLINT,
  target_reps_max        SMALLINT,
  actual_reps            SMALLINT,             -- optional, user can skip logging it
  actual_weight_kg       NUMERIC(6,2),         -- optional
  feedback               feedback_enum NOT NULL,
  adaptation_applied     TEXT                   -- e.g. 'increased_next_set_weight', null if none
);

CREATE INDEX idx_session_feedback_session ON session_exercise_feedback (session_id);

-- ============================================================================
-- GENUINE-ACTIVITY VERIFICATION — SCOPE NOTE
-- ============================================================================
-- Master Spec Section 5.7 describes 3 sub-layers: statistical trust-score,
-- GPS/sensor verification, and community flagging.
--
-- MVP scope (confirmed): only community flagging is implemented, via the
-- pr_votes crowd-voting mechanism below. Statistical trust-scoring and
-- GPS/sensor verification are explicitly DEFERRED — no tables for them
-- exist yet by design, not by omission. Add a `session_gps_logs` table and
-- a `trust_scores` table when those layers are actually built.

-- ============================================================================
-- RP LEDGER (append-only, for auditability)
-- ============================================================================
-- RP is earned ONLY from consistency + full-session-completion, CONFIRMED
-- never from PRs — this ledger is the source of truth for "why does this
-- user have this much RP", and users.rp_total is a denormalized total kept
-- in sync by the trigger below.

CREATE TABLE rp_ledger (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id   UUID REFERENCES sessions(id),        -- null for streak-milestone bonuses
  type         rp_type_enum NOT NULL,
  points       INT NOT NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rp_ledger_user ON rp_ledger (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION apply_rp_ledger() RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET rp_total = rp_total + NEW.points, updated_at = now()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rp_ledger_insert
AFTER INSERT ON rp_ledger
FOR EACH ROW EXECUTE FUNCTION apply_rp_ledger();

-- ============================================================================
-- DIET / NUTRITION
-- ============================================================================

CREATE TABLE diet_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id        UUID REFERENCES sessions(id),     -- links that day's training load
  date              DATE NOT NULL,
  target_calories   INT,
  target_protein_g  INT,
  target_carbs_g    INT,
  target_fat_g      INT,
  UNIQUE (user_id, date)
);

CREATE TABLE diet_log_meals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_log_id    UUID NOT NULL REFERENCES diet_logs(id) ON DELETE CASCADE,
  slot           meal_slot_enum NOT NULL,
  name           TEXT NOT NULL,
  cuisine        TEXT,
  calories       INT,
  protein_g      INT,
  carbs_g        INT,
  fat_g          INT
);

CREATE INDEX idx_diet_log_meals_log ON diet_log_meals (diet_log_id);

-- ============================================================================
-- SOCIAL GRAPH
-- ============================================================================

CREATE TABLE follows (
  follower_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE INDEX idx_follows_following ON follows (following_id);   -- "who follows me"

-- ============================================================================
-- PRs & COMMUNITY VERIFICATION
-- ============================================================================
-- prs is defined before posts so posts.pr_id can reference it directly.

CREATE TABLE prs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id            UUID NOT NULL REFERENCES exercises(id),
  metric                 TEXT NOT NULL,        -- '1rm_kg', 'time_min', 'distance_km' — kept as
                                                 -- TEXT (not enum) so new sports/metrics don't
                                                 -- need a migration
  value                  NUMERIC NOT NULL,
  previous_best          NUMERIC,
  session_id             UUID REFERENCES sessions(id),

  genuine_votes          INT NOT NULL DEFAULT 0,          -- kept in sync by trigger below
  flag_votes             INT NOT NULL DEFAULT 0,
  verification_status    pr_verification_enum NOT NULL DEFAULT 'unverified',

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prs_user_exercise ON prs (user_id, exercise_id, created_at DESC);

CREATE TABLE pr_votes (
  pr_id        UUID NOT NULL REFERENCES prs(id) ON DELETE CASCADE,
  voter_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote         vote_enum NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pr_id, voter_id)          -- one vote per user per PR — this is what stops
                                          -- a 50kg user's fake 200kg lift from just sitting
                                          -- there unchallenged, and stops brigading too
);

CREATE OR REPLACE FUNCTION recompute_pr_verification() RETURNS TRIGGER AS $$
DECLARE
  target_pr_id UUID := COALESCE(NEW.pr_id, OLD.pr_id);
  g INT;
  f INT;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE vote = 'genuine'),
    COUNT(*) FILTER (WHERE vote = 'flag')
  INTO g, f
  FROM pr_votes WHERE pr_id = target_pr_id;

  UPDATE prs SET
    genuine_votes = g,
    flag_votes = f,
    verification_status = (CASE
      WHEN f >= 5 AND f > g * 2 THEN 'disputed'
      WHEN g >= 5 THEN 'genuine'
      ELSE 'unverified'
    END)::pr_verification_enum
  WHERE id = target_pr_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pr_vote_change
AFTER INSERT OR UPDATE OR DELETE ON pr_votes
FOR EACH ROW EXECUTE FUNCTION recompute_pr_verification();

-- NOTE: verification_status intentionally never affects RP — RP only comes
-- from the rp_ledger (session completion / streaks). A disputed PR just
-- displays a "disputed" badge on the profile/feed instead of being deleted.

-- ============================================================================
-- POSTS & LIKES (confirmed Instagram-style feed — photo + caption allowed)
-- ============================================================================
-- CONFIRMED product decision: the feed is NOT "factual cards only" as the
-- original Master Spec (Section 5.6) described. Photo + caption are
-- supported, and the one-tap reaction is called "likes" (not "kudos").

CREATE TABLE posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           post_type_enum NOT NULL,
  caption        TEXT,
  photo_url      TEXT,
  session_id     UUID REFERENCES sessions(id),
  pr_id          UUID REFERENCES prs(id),       -- set when type = 'pr'
  likes_count    INT NOT NULL DEFAULT 0,        -- kept in sync by trigger below
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_user ON posts (user_id, created_at DESC);
CREATE INDEX idx_posts_feed ON posts (created_at DESC);

CREATE TABLE likes (
  post_id      UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)      -- one like per user per post
);

CREATE OR REPLACE FUNCTION sync_likes_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_likes_change
AFTER INSERT OR DELETE ON likes
FOR EACH ROW EXECUTE FUNCTION sync_likes_count();

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         notification_type_enum NOT NULL,
  payload      JSONB,          -- shape varies by type (from_user_id, post_id, tier, ...)
  read         BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications (user_id, read, created_at DESC);

-- --- device_tokens -----------------------------------------------------------
-- FIX (was missing): the `notifications` table only stores notification
-- history — it has no way to actually push via FCM. This table stores the
-- device token(s) needed to send a push.

CREATE TABLE device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token   TEXT NOT NULL,
  platform    device_platform_enum,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, fcm_token)
);

CREATE INDEX idx_device_tokens_user ON device_tokens (user_id);

-- ============================================================================
-- LEADERBOARD (materialized view — refresh periodically, e.g. every few minutes)
-- ============================================================================
-- Postgres-native replacement for a manually-maintained "snapshot" collection:
-- one REFRESH call recomputes global + per-tier rank in one pass.

CREATE MATERIALIZED VIEW leaderboard_snapshot AS
SELECT
  id AS user_id,
  name,
  tier,
  rp_total,
  RANK() OVER (PARTITION BY tier ORDER BY rp_total DESC) AS tier_rank,
  RANK() OVER (ORDER BY rp_total DESC)                   AS global_rank
FROM users
WHERE privacy = 'public';

CREATE UNIQUE INDEX idx_leaderboard_user ON leaderboard_snapshot (user_id);

-- Run on a schedule (cron / pg_cron):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_snapshot;
