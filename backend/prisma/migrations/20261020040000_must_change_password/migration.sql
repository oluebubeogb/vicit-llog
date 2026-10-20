-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT true;

-- Bootstrap admin from env should not be forced to change password after seed sets mustChangePassword false;
-- Existing rows default to true (staff must change); admin can be updated by seed on next boot.
