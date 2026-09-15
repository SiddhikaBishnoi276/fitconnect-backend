/**
 * Session Service - Real-time adaptation, workout state machine, and session completion handling.
 */
const dietModel = require('../diet/diet.model');

/**
 * Helper to safely link session to diet log without blocking or throwing.
 * @param {string|number} userId
 * @param {string|Date} date
 * @param {string|number} sessionId
 */
async function safeLinkSessionToDietLog(userId, date, sessionId) {
  try {
    await dietModel.linkSessionToDietLog(userId, date, sessionId);
  } catch (err) {
    console.warn(`⚠️ [SessionService] Failed to link session ${sessionId} to diet log:`, err?.message || err);
  }
}

/**
 * Creates a workout session and triggers diet log link.
 * @param {string|number} userId
 * @param {Object} sessionData
 * @returns {Promise<Object>}
 */
async function createSession(userId, sessionData = {}) {
  const date = sessionData.date || new Date().toISOString().split('T')[0];
  const session = { id: sessionData.id || Date.now(), userId, date, ...sessionData };

  await safeLinkSessionToDietLog(userId, date, session.id);

  return session;
}

/**
 * Completes a workout session and ensures diet log link.
 * @param {string|number} userId
 * @param {string|number} sessionId
 * @param {Object} [completionData={}]
 * @returns {Promise<Object>}
 */
async function completeSession(userId, sessionId, completionData = {}) {
  const date = completionData.date || new Date().toISOString().split('T')[0];
  const updatedSession = { id: sessionId, userId, date, status: 'completed', ...completionData };

  await safeLinkSessionToDietLog(userId, date, sessionId);

  return updatedSession;
}

module.exports = {
  createSession,
  completeSession,
  safeLinkSessionToDietLog
};
