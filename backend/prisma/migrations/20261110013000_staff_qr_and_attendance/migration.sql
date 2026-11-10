-- Staff permanent QR + PIN-protected badge photo + daily attendance
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffQrToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffPinHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffPinFailCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffPinLockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffBadgePhotoPath" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_staffQrToken_key" ON "User"("staffQrToken");

CREATE TABLE IF NOT EXISTS "StaffAttendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "arrivedAt" TIMESTAMP(3) NOT NULL,
    "exitedAt" TIMESTAMP(3),
    "arrivalGateId" TEXT,
    "exitGateId" TEXT,
    "scannedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffAttendance_userId_day_key" ON "StaffAttendance"("userId", "day");
CREATE INDEX IF NOT EXISTS "StaffAttendance_organisationId_day_idx" ON "StaffAttendance"("organisationId", "day");
CREATE INDEX IF NOT EXISTS "StaffAttendance_day_idx" ON "StaffAttendance"("day");

DO $$ BEGIN
  ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_scannedById_fkey" FOREIGN KEY ("scannedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
