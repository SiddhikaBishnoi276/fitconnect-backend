// Session controller: handles pre-check-in, active session query, per-exercise feedback, session completion, and cancellation
const sessionService = require('./session.service');
const { sendSuccess } = require('../../utils/responseFormatter');

/**
 * POST /sessions
 * Pre-session check-in and start workout session
 */
const createSessionHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const sessionData = await sessionService.createSession(userId, req.body);
    console.log('[DEBUG] createSession response data:', JSON.stringify(sessionData));
    return sendSuccess(res, sessionData, 'Session started successfully', 201);
  } catch (error) {
    if (error.code === 'SESSION_IN_PROGRESS') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'SESSION_IN_PROGRESS',
          message: error.message,
          session_id: error.session_id,
        },
      });
    }
    return next(error);
  }
};

/**
 * GET /sessions/active
 * Crash recovery - check if user has an active session in progress
 */
const getActiveSessionHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const activeSession = await sessionService.getActiveSession(userId);
    if (!activeSession) {
      return res.status(204).end();
    }
    return sendSuccess(res, activeSession, 'Active session retrieved successfully');
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /sessions/:id
 * Retrieve full session view by ID
 */
const getSessionByIdHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const session = await sessionService.getSessionById(userId, id);
    return sendSuccess(res, session, 'Session details retrieved successfully');
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /sessions/:id/exercises/:exerciseId/feedback
 * Mid-workout feedback for an exercise
 */
const submitExerciseFeedbackHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id: sessionId, exerciseId } = req.params;
    const result = await sessionService.submitExerciseFeedback(userId, sessionId, exerciseId, req.body);
    return sendSuccess(res, result, 'Exercise feedback recorded successfully');
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /sessions/:id/complete
 * End workout session: stats, PR detection, RP, and streaks
 */
const completeSessionHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id: sessionId } = req.params;
    const summary = await sessionService.completeSession(userId, sessionId, req.body);
    return sendSuccess(res, summary, 'Session completed successfully');
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /sessions/:id/cancel
 * Discard mid-session workout
 */
const cancelSessionHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id: sessionId } = req.params;
    await sessionService.cancelSession(userId, sessionId);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createSessionHandler,
  getActiveSessionHandler,
  getSessionByIdHandler,
  submitExerciseFeedbackHandler,
  completeSessionHandler,
  cancelSessionHandler,
};
