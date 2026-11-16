-- v21: store talk time on each in-app call and index calls by callee account.
ALTER TABLE "RingCall" ADD COLUMN IF NOT EXISTS "durationSec" INTEGER;

-- Backfill: calls that connected get endedAt - answeredAt; the rest 0.
-- Rows hit by the old hang-up bug (answeredAt overwritten at hang-up) will show ~0s; that history cannot be recovered.
UPDATE "RingCall"
SET "durationSec" = CASE
  WHEN "answeredAt" IS NOT NULL AND "endedAt" IS NOT NULL THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM ("endedAt" - "answeredAt")))::INTEGER)
  ELSE 0
END
WHERE "durationSec" IS NULL AND "status" NOT IN ('RINGING', 'ACCEPTED');

CREATE INDEX IF NOT EXISTS "RingCall_calleeUserId_createdAt_idx" ON "RingCall"("calleeUserId", "createdAt");
