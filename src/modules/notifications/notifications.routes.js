// Notifications routes: defines endpoints for notification management (/api/v1/notifications)
const express = require('express');
const notificationsController = require('./notifications.controller');
const authGuard = require('../../middleware/authGuard');

const router = express.Router();

// 1. Fetch paginated notifications & unread count
router.get('/', authGuard, notificationsController.getNotifications);

// 2. Mark all notifications as read (Defined BEFORE dynamic /:id/read route to prevent collision)
router.patch('/read-all', authGuard, notificationsController.markAllRead);

// 3. Mark a specific notification as read
router.patch('/:id/read', authGuard, notificationsController.markRead);

// 4. Register or update FCM device token
router.post('/device-tokens', authGuard, notificationsController.registerDeviceToken);

module.exports = router;