// Session service: real-time adaptation, fatigue adjustments, and workout state machine
const sessionModel = require('./session.model');
const { SESSION_COMPLETION_RP, STREAK_MILESTONE_RP, STREAK_MILESTONES } = require('../../config/session.config');

/**
 * Map check-in values from request body (numeric 1-5 or string) to Postgres ENUM strings
 */
const mapSleepQualityToEnum = (val) => {
  if (typeof val === 'number') {
    if (val <= 2) return 'poor';
    if (val === 3) return 'ok';
    return 'good';
  }
  if (['good', 'ok', 'poor'].includes(val)) return val;
  return 'ok';
};

const mapSorenessToEnum = (val) => {
  if (typeof val === 'number') {
    if (val <= 2) return 'none';
    if (val === 3) return 'some';
    return 'sore';
  }
  if (['none', 'some', 'sore'].includes(val)) return val;
  return 'none';
};

const mapEnergyToEnum = (val) => {
  if (typeof val === 'number') {
    if (val <= 2) return 'tired';
    if (val === 3) return 'normal';
    return 'fresh';
  }
  if (['fresh', 'normal', 'tired'].includes(val)) return val;
  return 'normal';
};

/**
 * Shared canonical adaptation engine.
 * Computes session exercise list with live target adjustments based on check-in & mid-workout feedback.
 * 
 * @param {object} session - Session DB record
 * @param {Array} planDayExercises - Canonical target rows from plan_day_exercises
 * @param {Array} feedbackRowsSoFar - session_exercise_feedback rows recorded so far
 * @returns {Array} List of exercise objects with calculated target/actual fields & status
 */
const computeSessionExerciseList = (session, planDayExercises, feedbackRowsSoFar = []) => {
  // Step 1: Compute baseline_offset
  const sorenessVal = session.soreness;
  const sleepVal = session.sleep_quality;

  const isSore = sorenessVal === 'sore' || (typeof sorenessVal === 'number' && sorenessVal >= 4);
  const isPoorSleep = sleepVal === 'poor' || (typeof sleepVal === 'number' && sleepVal <= 2);
  const isDiscomfort = Boolean(session.new_discomfort_present);

  const baselineOffset = (isSore || isPoorSleep || isDiscomfort) ? -1 : 0;

  // Compute event_offset from feedbackRowsSoFar in order_index order
  let eventOffset = 0;
  const sortedFeedback = [...feedbackRowsSoFar].sort((a, b) => Number(a.order_index) - Number(b.order_index));
  for (const row of sortedFeedback) {
    if (row.feedback === 'too_hard') eventOffset -= 1;
    if (row.feedback === 'too_easy') eventOffset += 1;
  }

  // total_offset clamped to [-2, +2]
  const totalOffset = Math.min(2, Math.max(-2, baselineOffset + eventOffset));

  const feedbackMap = new Map();
  sortedFeedback.forEach(row => {
    feedbackMap.set(Number(row.order_index), row);
  });

  const sortedPlanExercises = [...planDayExercises].sort((a, b) => Number(a.order_index) - Number(b.order_index));

  // Step 2 & 3: Build list for every row in plan_day_exercises
  return sortedPlanExercises.map((pde) => {
    const orderIdx = Number(pde.order_index);
    const fbRow = feedbackMap.get(orderIdx);

    if (fbRow) {
      return {
        exercise_id: pde.exercise_id,
        order_index: orderIdx,
        name: pde.exercise_name || pde.name || 'Exercise',
        status: fbRow.feedback === 'skipped' ? 'skipped' : 'completed',
        target_sets: Number(pde.target_sets || 3),
        target_reps_min: fbRow.target_reps_min !== null && fbRow.target_reps_min !== undefined ? Number(fbRow.target_reps_min) : null,
        target_reps_max: fbRow.target_reps_max !== null && fbRow.target_reps_max !== undefined ? Number(fbRow.target_reps_max) : null,
        actual_reps: fbRow.actual_reps !== null && fbRow.actual_reps !== undefined ? Number(fbRow.actual_reps) : null,
        actual_weight_kg: fbRow.actual_weight_kg !== null && fbRow.actual_weight_kg !== undefined ? Number(fbRow.actual_weight_kg) : null,
        feedback: fbRow.feedback,
        adaptation_applied: fbRow.adaptation_applied || null,
      };
    } else {
      // Pending exercise - apply totalOffset
      const origSets = Number(pde.target_sets || 3);
      const origMin = pde.target_reps_min !== null && pde.target_reps_min !== undefined ? Number(pde.target_reps_min) : null;
      const origMax = pde.target_reps_max !== null && pde.target_reps_max !== undefined ? Number(pde.target_reps_max) : null;

      let targetSets = origSets;
      if (totalOffset === -2) targetSets = Math.max(1, origSets - 1);
      else if (totalOffset === 2) targetSets = origSets + 1;

      const scaleReps = (val) => {
        if (val === null || val === undefined) return null;
        if (totalOffset === -2) return Math.max(1, Math.round(val * 0.75));
        if (totalOffset === -1) return Math.max(1, Math.round(val * 0.85));
        if (totalOffset === 0) return val;
        if (totalOffset === 1) return Math.round(val * 1.10);
        if (totalOffset === 2) return Math.round(val * 1.15);
        return val;
      };

      return {
        exercise_id: pde.exercise_id,
        order_index: orderIdx,
        name: pde.exercise_name || pde.name || 'Exercise',
        status: 'pending',
        target_sets: targetSets,
        target_reps_min: scaleReps(origMin),
        target_reps_max: scaleReps(origMax),
      };
    }
  });
};

/**
 * POST /sessions - Pre-session check-in & start session
 */
const createSession = async (userId, payload) => {
  const { plan_day_id, sleep_quality, soreness, energy, new_discomfort_present, new_discomfort_body_part } = payload;

  if (!plan_day_id) {
    const err = new Error('plan_day_id is required');
    err.statusCode = 400;
    throw err;
  }

  // 1. Verify plan_day_id belongs to user's active plan & is not rest day
  const planDay = await sessionModel.getPlanDayById(plan_day_id, userId);
  if (!planDay) {
    const err = new Error('Invalid plan_day_id or plan day does not belong to active plan');
    err.statusCode = 400;
    throw err;
  }

  if (planDay.sport_id === null || (planDay.session_type && planDay.session_type.toLowerCase().includes('rest'))) {
    const err = new Error('Cannot start a session on a rest day');
    err.statusCode = 400;
    throw err;
  }

  // 2. Check user has no active session
  const activeSession = await sessionModel.findActiveSessionByUserId(userId);
  if (activeSession) {
    const err = new Error('An active workout session already exists. Please resume or finish it.');
    err.statusCode = 409;
    err.code = 'SESSION_IN_PROGRESS';
    err.session_id = activeSession.id;
    throw err;
  }

  // 3. Create session record
  const session = await sessionModel.createSession({
    userId,
    planDayId: plan_day_id,
    sleepQuality: mapSleepQualityToEnum(sleep_quality),
    soreness: mapSorenessToEnum(soreness),
    energy: mapEnergyToEnum(energy),
    newDiscomfortPresent: new_discomfort_present,
    newDiscomfortBodyPart: new_discomfort_body_part,
  });

  // 4. Compute initial exercise list
  const planDayExercises = await sessionModel.getPlanDayExercises(plan_day_id);
  const exercises = computeSessionExerciseList(session, planDayExercises, []);

  return {
    session_id: session.id,
    exercises,
  };
};

/**
 * GET /sessions/active - Crash recovery check
 */
const getActiveSession = async (userId) => {
  const activeSession = await sessionModel.findActiveSessionByUserId(userId);
  if (!activeSession) {
    return null;
  }

  const planDayExercises = await sessionModel.getPlanDayExercises(activeSession.plan_day_id);
  const feedbackRows = await sessionModel.getSessionFeedbackRows(activeSession.id);
  const exercises = computeSessionExerciseList(activeSession, planDayExercises, feedbackRows);

  const firstPending = exercises.find(e => e.status === 'pending');
  let resumeAt = 1;
  if (firstPending) {
    resumeAt = firstPending.order_index;
  } else if (exercises.length > 0) {
    resumeAt = exercises[exercises.length - 1].order_index + 1;
  }

  return {
    session_id: activeSession.id,
    plan_day_id: activeSession.plan_day_id,
    sleep_quality: activeSession.sleep_quality,
    soreness: activeSession.soreness,
    energy: activeSession.energy,
    new_discomfort_present: activeSession.new_discomfort_present,
    new_discomfort_body_part: activeSession.new_discomfort_body_part,
    exercises,
    resume_at_order_index: resumeAt,
  };
};

/**
 * GET /sessions/:id - Full active session view
 */
const getSessionById = async (userId, sessionId) => {
  const session = await sessionModel.getSessionById(sessionId);
  if (!session || session.user_id !== userId) {
    const err = new Error('Session not found');
    err.statusCode = 404;
    throw err;
  }

  const planDayExercises = await sessionModel.getPlanDayExercises(session.plan_day_id);
  const feedbackRows = await sessionModel.getSessionFeedbackRows(session.id);
  const exercises = computeSessionExerciseList(session, planDayExercises, feedbackRows);

  return {
    session_id: session.id,
    plan_day_id: session.plan_day_id,
    date: session.date,
    status: session.status,
    sleep_quality: session.sleep_quality,
    soreness: session.soreness,
    energy: session.energy,
    new_discomfort_present: session.new_discomfort_present,
    new_discomfort_body_part: session.new_discomfort_body_part,
    duration_min: session.duration_min,
    exercises_completed: session.exercises_completed,
    adapted_count: session.adapted_count,
    skipped_count: session.skipped_count,
    fully_completed: session.fully_completed,
    created_at: session.created_at,
    completed_at: session.completed_at,
    exercises,
  };
};

/**
 * POST /sessions/:id/exercises/:exerciseId/feedback - Mid-workout feedback
 */
const submitExerciseFeedback = async (userId, sessionId, exerciseId, payload) => {
  const { order_index, actual_reps, actual_weight_kg, feedback } = payload;

  if (order_index === undefined || order_index === null || !feedback) {
    const err = new Error('order_index and feedback are required');
    err.statusCode = 400;
    throw err;
  }

  const session = await sessionModel.getSessionById(sessionId);
  if (!session || session.user_id !== userId) {
    const err = new Error('Session not found');
    err.statusCode = 404;
    throw err;
  }

  if (session.status !== 'in_progress') {
    const err = new Error('Session is not in progress');
    err.statusCode = 409;
    throw err;
  }

  // 1. Verify matching plan_day_exercises row
  const planDayEx = await sessionModel.findPlanDayExercise(session.plan_day_id, exerciseId, Number(order_index));
  if (!planDayEx) {
    const err = new Error('Exercise with specified order_index not found in this plan day');
    err.statusCode = 404;
    throw err;
  }

  const planDayExercises = await sessionModel.getPlanDayExercises(session.plan_day_id);
  const priorFeedbackRows = (await sessionModel.getSessionFeedbackRows(sessionId)).filter(r => Number(r.order_index) < Number(order_index));

  // 2. Compute effective target shown right before feedback
  const computedPrior = computeSessionExerciseList(session, planDayExercises, priorFeedbackRows);
  const matchedTarget = computedPrior.find(e => Number(e.order_index) === Number(order_index));

  const effectiveMin = matchedTarget ? matchedTarget.target_reps_min : planDayEx.target_reps_min;
  const effectiveMax = matchedTarget ? matchedTarget.target_reps_max : planDayEx.target_reps_max;

  // 3. Compute adaptation_applied note
  let adaptationApplied = null;
  if (feedback === 'too_hard') {
    adaptationApplied = 'reduced next sets by 1, reps -15%';
  } else if (feedback === 'too_easy') {
    adaptationApplied = 'increased next sets by 1, reps +10%';
  }

  // 4. Record feedback row
  await sessionModel.insertSessionExerciseFeedback({
    sessionId,
    exerciseId,
    orderIndex: Number(order_index),
    targetRepsMin: effectiveMin,
    targetRepsMax: effectiveMax,
    actualReps: actual_reps !== undefined && actual_reps !== null ? Number(actual_reps) : null,
    actualWeightKg: actual_weight_kg !== undefined && actual_weight_kg !== null ? Number(actual_weight_kg) : null,
    feedback,
    adaptationApplied,
  });

  // 5. Recompute remaining exercises
  const allFeedbackRows = await sessionModel.getSessionFeedbackRows(sessionId);
  const recomputedAll = computeSessionExerciseList(session, planDayExercises, allFeedbackRows);
  const remainingExercises = recomputedAll.filter(e => e.status === 'pending');

  return {
    recorded: {
      exercise_id: exerciseId,
      order_index: Number(order_index),
      feedback,
    },
    remaining_exercises: remainingExercises,
  };
};

/**
 * POST /sessions/:id/complete - End session, stats, PR detection, RP + streak
 */
const completeSession = async (userId, sessionId, payload) => {
  const durationMin = typeof payload.duration_min === 'number' ? payload.duration_min : parseInt(payload.duration_min, 10) || 0;

  const session = await sessionModel.getSessionById(sessionId);
  if (!session || session.user_id !== userId) {
    const err = new Error('Session not found');
    err.statusCode = 404;
    throw err;
  }

  if (session.status !== 'in_progress') {
    const err = new Error('Session is not in progress');
    err.statusCode = 409;
    throw err;
  }

  const feedbackRows = await sessionModel.getSessionFeedbackRows(sessionId);
  const planDayExercises = await sessionModel.getPlanDayExercises(session.plan_day_id);

  const exercisesCompleted = feedbackRows.filter(r => r.feedback !== 'skipped').length;
  const skippedCount = feedbackRows.filter(r => r.feedback === 'skipped').length;
  const adaptedCount = feedbackRows.filter(r => r.adaptation_applied !== null && r.adaptation_applied !== undefined).length;

  const fullyCompleted = planDayExercises.length > 0 && exercisesCompleted === planDayExercises.length;

  // Update session record
  await sessionModel.updateSessionComplete(sessionId, {
    durationMin,
    exercisesCompleted,
    adaptedCount,
    skippedCount,
    fullyCompleted,
  });

  // PR Detection: Removed auto-PR insertion (PRs are user-managed via Profile per sports)
  const newPrs = [];

  // RP & Streak calculation
  let rpAwarded = 0;
  let newCurrentStreak = 0;
  let streakMilestoneHit = null;

  const user = await sessionModel.getUserById(userId);
  const totalPlanCount = planDayExercises.length || 1;
  const completionRatio = Math.min(1, Math.max(0, exercisesCompleted / totalPlanCount));
  const baseRpEarned = Math.round(SESSION_COMPLETION_RP * completionRatio);

  // 1. Proportional Session Completion RP
  if (baseRpEarned > 0) {
    await sessionModel.insertRpLedger({
      userId,
      sessionId,
      type: 'session_completion',
      points: baseRpEarned,
      reason: `Session completion (${exercisesCompleted}/${totalPlanCount} exercises completed)`,
    });
    rpAwarded += baseRpEarned;
  }

  // 2. Streak & Milestone bonus ONLY if 100% fully completed without skips
  if (fullyCompleted) {
    const prevDateStr = await sessionModel.getLastCompletedSessionDate(userId, sessionId);
    const todayStr = session.date 
      ? new Date(session.date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    let currentStreak = 1;
    if (prevDateStr) {
      const diffMs = new Date(todayStr).getTime() - new Date(prevDateStr).getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        currentStreak = (user?.current_streak || 0) + 1;
      } else if (diffDays === 0) {
        currentStreak = Math.max(1, user?.current_streak || 1);
      } else {
        currentStreak = 1;
      }
    } else {
      currentStreak = 1;
    }

    const longestStreak = Math.max(user?.longest_streak || 0, currentStreak);
    await sessionModel.updateUserStreaks(userId, currentStreak, longestStreak);
    newCurrentStreak = currentStreak;

    // Streak milestone check
    if (STREAK_MILESTONES.includes(currentStreak)) {
      streakMilestoneHit = currentStreak;
      rpAwarded += STREAK_MILESTONE_RP;

      await sessionModel.insertRpLedger({
        userId,
        sessionId: null,
        type: 'streak_milestone',
        points: STREAK_MILESTONE_RP,
        reason: `${currentStreak}-day streak`,
      });
    }
  } else {
    newCurrentStreak = user?.current_streak || 0;
  }

  return {
    duration_min: durationMin,
    exercises_completed: exercisesCompleted,
    adapted_count: adaptedCount,
    skipped_count: skippedCount,
    fully_completed: fullyCompleted,
    rp_awarded: rpAwarded,
    new_current_streak: newCurrentStreak,
    streak_milestone_hit: streakMilestoneHit,
    new_prs: newPrs,
  };
};

/**
 * POST /sessions/:id/cancel - Discard mid-session workout
 */
const cancelSession = async (userId, sessionId) => {
  const session = await sessionModel.getSessionById(sessionId);
  if (!session || session.user_id !== userId) {
    const err = new Error('Session not found');
    err.statusCode = 404;
    throw err;
  }

  if (session.status === 'completed') {
    const err = new Error('Cannot cancel a completed workout session');
    err.statusCode = 409;
    throw err;
  }

  await sessionModel.deleteSession(sessionId);
  return true;
};

module.exports = {
  computeSessionExerciseList,
  createSession,
  getActiveSession,
  getSessionById,
  submitExerciseFeedback,
  completeSession,
  cancelSession,
};
