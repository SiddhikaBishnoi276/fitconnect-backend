// Notifications model: database queries for notifications and FCM device tokens
const db = require('../../config/db');

/**
 * Get paginated notifications for a specific user
 * @param {string} userId
 * @param {number} [limit=20]
 * @param {number} [offset=0]
 * @returns {Promise<Array<object>>}
 */
const getNotificationsByUser = async (userId, limit = 20, offset = 0) => {
    const queryText = `
    SELECT id, type, payload, read, created_at
    FROM notifications
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3;
  `;
    const result = await db.query(queryText, [userId, limit, offset]);
    return result.rows;
};

/**
 * Get count of unread notifications for a user
 * @param {string} userId
 * @returns {Promise<number>}
 */
const getUnreadCount = async (userId) => {
    const queryText = `
    SELECT COUNT(*) AS count
    FROM notifications
    WHERE user_id = $1 AND read = false;
  `;
    const result = await db.query(queryText, [userId]);
    return parseInt(result.rows[0]?.count || 0, 10);
};

/**
 * Mark a single notification as read, ensuring it belongs to the user
 * @param {string} notificationId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
const markNotificationRead = async (notificationId, userId) => {
    const queryText = `
    UPDATE notifications
    SET read = true
    WHERE id = $1 AND user_id = $2
    RETURNING id, type, payload, read, created_at;
  `;
    const result = await db.query(queryText, [notificationId, userId]);
    return result.rows[0] || null;
};

/**
 * Mark all unread notifications for a user as read
 * @param {string} userId
 * @returns {Promise<number>} Returns the number of rows updated
 */
const markAllNotificationsRead = async (userId) => {
    const queryText = `
    UPDATE notifications
    SET read = true
    WHERE user_id = $1 AND read = false
    RETURNING id;
  `;
    const result = await db.query(queryText, [userId]);
    return result.rowCount;
};

/**
 * Upsert device token for push notifications
 * @param {string} userId
 * @param {string} fcmToken
 * @param {string} [platform='android'] ('ios' | 'android' | 'web')
 * @returns {Promise<object>}
 */
const upsertDeviceToken = async (userId, fcmToken, platform = 'android') => {
    const queryText = `
    INSERT INTO device_tokens (user_id, fcm_token, platform)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, fcm_token) DO UPDATE SET platform = EXCLUDED.platform
    RETURNING id, user_id, fcm_token, platform, created_at;
  `;
    const result = await db.query(queryText, [userId, fcmToken, platform]);
    return result.rows[0];
};

/**
 * Create a new notification record
 * @param {string} userId
 * @param {string} type ('post_liked' | 'streak_milestone' | 'tier_promotion' | 'followed_user_pr' | 'pr_disputed')
 * @param {object} [payload={}]
 * @returns {Promise<object>}
 */
const createNotification = async (userId, type, payload = {}) => {
    const queryText = `
    INSERT INTO notifications (user_id, type, payload)
    VALUES ($1, $2, $3)
    RETURNING id, user_id, type, payload, read, created_at;
  `;
    const result = await db.query(queryText, [userId, type, JSON.stringify(payload)]);
    return result.rows[0];
};

/**
 * Get all active device tokens for a specific user
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
const getDeviceTokensByUserId = async (userId) => {
    const queryText = `
    SELECT id, user_id, fcm_token, platform, created_at
    FROM device_tokens
    WHERE user_id = $1;
  `;
    const result = await db.query(queryText, [userId]);
    return result.rows;
};

/**
 * Delete a specific device token
 * @param {string} userId
 * @param {string} fcmToken
 * @returns {Promise<number>}
 */
const deleteDeviceToken = async (userId, fcmToken) => {
    const queryText = `
    DELETE FROM device_tokens
    WHERE user_id = $1 AND fcm_token = $2;
  `;
    const result = await db.query(queryText, [userId, fcmToken]);
    return result.rowCount;
};

module.exports = {
    getNotificationsByUser,
    getUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    upsertDeviceToken,
    createNotification,
    getDeviceTokensByUserId,
    deleteDeviceToken,
};