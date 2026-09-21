// Notifications service: business logic for notifications and FCM device tokens
const {
    getNotificationsByUser,
    getUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    upsertDeviceToken,
} = require('./notifications.model');

const VALID_PLATFORMS = ['ios', 'android', 'web'];

/**
 * Creates a formatted error object with status code and error code
 * @param {string} message
 * @param {string} code
 * @param {number} statusCode
 * @returns {Error}
 */
const createError = (message, code, statusCode) => {
    const error = new Error(message);
    error.code = code;
    error.statusCode = statusCode;
    return error;
};

/**
 * Get paginated notifications and unread count for a user
 * @param {string} userId
 * @param {number} [page=1]
 * @param {number} [limit=20]
 * @returns {Promise<{ notifications: Array<object>, unread_count: number }>}
 */
const getNotifications = async (userId, page = 1, limit = 20) => {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 20);
    const offset = (pageNum - 1) * limitNum;

    const [notifications, unreadCount] = await Promise.all([
        getNotificationsByUser(userId, limitNum, offset),
        getUnreadCount(userId),
    ]);

    return {
        notifications,
        unread_count: unreadCount,
    };
};

/**
 * Mark a specific notification as read
 * @param {string} notificationId
 * @param {string} userId
 * @returns {Promise<object>}
 */
const markAsRead = async (notificationId, userId) => {
    const notification = await markNotificationRead(notificationId, userId);

    if (!notification) {
        throw createError('Notification not found', 'NOTIFICATION_NOT_FOUND', 404);
    }

    return notification;
};

/**
 * Mark all unread notifications as read for a user
 * @param {string} userId
 * @returns {Promise<{ marked_count: number }>}
 */
const markAllAsRead = async (userId) => {
    const rowCount = await markAllNotificationsRead(userId);
    return {
        marked_count: rowCount,
    };
};

/**
 * Register or update an FCM device token for a user
 * @param {string} userId
 * @param {string} fcmToken
 * @param {string} [platform='android']
 * @returns {Promise<object>}
 */
const registerDeviceToken = async (userId, fcmToken, platform) => {
    if (!fcmToken || typeof fcmToken !== 'string' || !fcmToken.trim()) {
        throw createError('fcm_token is required', 'VALIDATION_ERROR', 400);
    }

    let chosenPlatform = 'android';
    if (platform !== undefined && platform !== null && platform !== '') {
        if (typeof platform !== 'string' || !VALID_PLATFORMS.includes(platform.toLowerCase().trim())) {
            throw createError(
                `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}`,
                'VALIDATION_ERROR',
                400
            );
        }
        chosenPlatform = platform.toLowerCase().trim();
    }

    const savedToken = await upsertDeviceToken(userId, fcmToken.trim(), chosenPlatform);
    return savedToken;
};

module.exports = {
    VALID_PLATFORMS,
    createError,
    getNotifications,
    markAsRead,
    markAllAsRead,
    registerDeviceToken,
};