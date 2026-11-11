-- RingCall: remember who placed the call, who was meant to answer, the responsible
-- gate officer, and the parent call for call-backs.
ALTER TABLE "RingCall" ADD COLUMN "callerUserId" TEXT;
ALTER TABLE "RingCall" ADD COLUMN "calleeUserId" TEXT;
ALTER TABLE "RingCall" ADD COLUMN "gateOfficerUserId" TEXT;
ALTER TABLE "RingCall" ADD COLUMN "parentCallId" TEXT;

UPDATE "RingCall"
SET "callerUserId" = "fromUserId",
    "calleeUserId" = "toUserId"
WHERE "callerUserId" IS NULL;

CREATE INDEX "RingCall_parentCallId_idx" ON "RingCall"("parentCallId");
CREATE INDEX "RingCall_callerUserId_createdAt_idx" ON "RingCall"("callerUserId", "createdAt");

ALTER TABLE "RingCall"
  ADD CONSTRAINT "RingCall_parentCallId_fkey"
  FOREIGN KEY ("parentCallId") REFERENCES "RingCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Dispatch may store several particulars photos.
ALTER TABLE "Dispatch" ADD COLUMN "photoPaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Dispatch"
SET "photoPaths" = ARRAY["photoPath"]
WHERE "photoPath" IS NOT NULL AND "photoPath" <> '' AND (cardinality("photoPaths") = 0);
