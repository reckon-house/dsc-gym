-- Order availability exceptions so a later one overrides an earlier one.
-- Existing rows get a single backfill value; their relative order was never
-- recorded, so they are treated as simultaneous and the previous
-- add-then-subtract behaviour is preserved for them.
ALTER TABLE "AvailabilityException" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Carry "this already happened" from proposal to commit; the commit
-- re-validates and would otherwise reject its own staged booking.
ALTER TABLE "ProposedBooking" ADD COLUMN "allowPast" BOOLEAN NOT NULL DEFAULT false;
