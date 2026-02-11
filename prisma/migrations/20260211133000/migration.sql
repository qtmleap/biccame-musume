-- DropIndex
DROP INDEX IF EXISTS `user_events_user_id_event_id_key`;

-- CreateIndex
CREATE UNIQUE INDEX `user_events_userId_eventId_status_key` ON `user_events`(`user_id`, `event_id`, `status`);
