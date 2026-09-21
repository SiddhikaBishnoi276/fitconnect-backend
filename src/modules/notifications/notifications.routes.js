// Notifications routes: defines endpoints for notification management (/api/v1/notifications)
const express = require('express');
const notificationsController = require('./notifications.controller');
const authGuard = require('../../middleware/authGuard');

const router = express.Router();

// 1. Standalone lightweight unread count route
router.get('/unread-count', authGuard, notificationsController.getUnreadCount);

// 2. Fetch paginated notifications & unread count
router.get('/', authGuard, notificationsController.getNotifications);

// 3. Mark all notifications as read (Defined BEFORE dynamic /:id/read route to prevent collision)
router.patch('/read-all', authGuard, notificationsController.markAllRead);

// 4. Mark a specific notification as read
router.patch('/:id/read', authGuard, notificationsController.markRead);

// 5. Register or update FCM device token
router.post('/device-tokens', authGuard, notificationsController.registerDeviceToken);

// 6. Unregister/remove FCM device token
router.delete('/device-tokens', authGuard, notificationsController.unregisterDeviceToken);

module.exports = router;