-- v24: guests can retake their registration photo (same QR) until they arrive / pass a checkpoint
ALTER TABLE "Visitor" ADD COLUMN IF NOT EXISTS "photoTakenAt" TIMESTAMP(3);
ALTER TABLE "Visitor" ADD COLUMN IF NOT EXISTS "photoRetakes" INTEGER NOT NULL DEFAULT 0;
