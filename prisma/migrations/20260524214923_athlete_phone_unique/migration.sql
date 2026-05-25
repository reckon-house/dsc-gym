-- Phone is unique so we can use it as a login identifier alongside email.
-- (Verified at migration time that there are zero duplicates in prod.)
CREATE UNIQUE INDEX "Athlete_phone_key" ON "Athlete"("phone");
