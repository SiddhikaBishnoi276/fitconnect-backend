// Notifications service: business logic for notifications and FCM device tokens
const notificationsModel = require('./notifications.model');
const {
    getNotificationsByUser,
    getUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    upsertDeviceToken,
    createNotification,
    deleteDeviceToken,
} = notificationsModel;

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
 * Trigger a new follower notification
 * @param {string} targetUserId - User being followed
 * @param {string} followerId - User initiating the follow
 * @param {string} followerName - Name of the follower
 * @returns {Promise<object>}
 */
const notifyNewFollower = async (targetUserId, followerId, followerName) => {
    // 1. Fetch user device tokens for push notification attempt
    const deviceTokens = await notificationsModel.getDeviceTokensByUserId(targetUserId);
    console.log(`[Push Notification] Checking device tokens for user ${targetUserId}: found ${deviceTokens.length} token(s)`);
    if (deviceTokens.length > 0) {
        console.log(`[Push Notification] Attempting to dispatch FCM push to ${deviceTokens.length} device(s) for event 'new_follower'`);
    } else {
        console.log(`[Push Notification] No registered FCM tokens for user ${targetUserId}; push skipped.`);
    }

    // 2. Persist in-app notification
    const payload = {
        follower_id: followerId,
        follower_name: followerName,
        user_id: followerId,
        name: followerName,
    };
    return await createNotification(targetUserId, 'new_follower', payload);
};

/**
 * Trigger a post liked notification
 * @param {string} postOwnerId - Owner of the post
 * @param {string} likerId - User who liked the post
 * @param {string} likerName - Name of the liker
 * @param {string|number} postId - ID of the liked post
 * @returns {Promise<object>}
 */
const notifyPostLiked = async (postOwnerId, likerId, likerName, postId) => {
    // 1. Fetch user device tokens for push notification attempt
    const deviceTokens = await notificationsModel.getDeviceTokensByUserId(postOwnerId);
    console.log(`[Push Notification] Checking device tokens for user ${postOwnerId}: found ${deviceTokens.length} token(s)`);
    if (deviceTokens.length > 0) {
        console.log(`[Push Notification] Attempting to dispatch FCM push to ${deviceTokens.length} device(s) for event 'post_liked'`);
    } else {
        console.log(`[Push Notification] No registered FCM tokens for user ${postOwnerId}; push skipped.`);
    }

    // 2. Persist in-app notification
    const payload = {
        liker_id: likerId,
        liker_name: likerName,
        user_id: likerId,
        name: likerName,
        post_id: postId,
    };
    return await createNotification(postOwnerId, 'post_liked', payload);
};

/**
 * Trigger a streak milestone notification for a user
 * @param {string} userId 
 * @param {number} streakDays 
 * @returns {Promise<object>}
 */
const notifyStreakMilestone = async (userId, streakDays) => {
    const payload = { streak_days: Number(streakDays) };
    return await createNotification(userId, 'streak_milestone', payload);
};

/**
 * Trigger a tier promotion notification for a user
 * @param {string} userId 
 * @param {string} newTier 
 * @returns {Promise<object>}
 */
const notifyTierPromotion = async (userId, newTier) => {
    const payload = { tier: String(newTier) };
    return await createNotification(userId, 'tier_promotion', payload);
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
 * Get unread notification count only for a user
 * @param {string} userId 
 * @returns {Promise<{ unread_count: number }>}
 */
const getUnreadNotificationsCount = async (userId) => {
    const unreadCount = await getUnreadCount(userId);
    return {
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

/**
 * Remove an FCM device token for a user
 * @param {string} userId
 * @param {string} fcmToken
 * @returns {Promise<{ removed: boolean }>}
 */
const unregisterDeviceToken = async (userId, fcmToken) => {
    if (!fcmToken || typeof fcmToken !== 'string' || !fcmToken.trim()) {
        throw createError('fcm_token is required', 'VALIDATION_ERROR', 400);
    }

    await deleteDeviceToken(userId, fcmToken.trim());
    return { removed: true };
};

module.exports = {
    VALID_PLATFORMS,
    createError,
    notifyNewFollower,
    notifyPostLiked,
    notifyStreakMilestone,
    notifyTierPromotion,
    getNotifications,
    getUnreadNotificationsCount,
    markAsRead,
    markAllAsRead,
    registerDeviceToken,
    unregisterDeviceToken,
};