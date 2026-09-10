-- Disable a staff login without deleting the person.
--
-- Archiving a Trainer hid them from coach pickers but never stopped them
-- signing in. Deleting the User would break attribution instead: resolvedBy,
-- createdBy and NotificationLog all reference it.
ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
