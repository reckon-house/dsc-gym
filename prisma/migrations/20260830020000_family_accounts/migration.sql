-- Phase B: one parent email covers multiple kids.
--
-- The unique indexes are what blocked families. Dropping them makes "all
-- athletes sharing a normalized email" the definition of a family; login
-- resolves that set and the JWT carries an active athlete plus the siblings.
--
-- Plain indexes replace them: the lookups (login by email or phone) are the
-- same queries, they just no longer need to return at most one row.
DROP INDEX "Athlete_email_key";
DROP INDEX "Athlete_phone_key";
CREATE INDEX "Athlete_email_idx" ON "Athlete"("email");
CREATE INDEX "Athlete_phone_idx" ON "Athlete"("phone");
