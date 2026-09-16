// Notifications controller: handles request/response for notifications and device tokens
const notificationsService = require('./notifications.service');
const { sendSuccess } = require('../../utils/responseFormatter');

/**
 * Controller handler to fetch paginated notifications and unread count
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getNotifications = async (req, res, next) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const data = await notificationsService.getNotifications(req.user.id, page, limit);
    return sendSuccess(res, data, 'Notifications fetched successfully', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller handler to mark a single notification as read
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const markRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const notification = await notificationsService.markAsRead(id, req.user.id);
    return sendSuccess(res, notification, 'Notification marked as read', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller handler to mark all unread notifications as read
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const markAllRead = async (req, res, next) => {
  try {
    const result = await notificationsService.markAllAsRead(req.user.id);
    return sendSuccess(res, result, 'All notifications marked as read', 200);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller handler to register or update an FCM device token
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const registerDeviceToken = async (req, res, next) => {
  try {
    const { fcm_token, platform } = req.body;
    const token = await notificationsService.registerDeviceToken(req.user.id, fcm_token, platform);
    return sendSuccess(res, token, 'Device token registered successfully', 201);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getNotifications,
  markRead,
  markAllRead,
  registerDeviceToken,
};
