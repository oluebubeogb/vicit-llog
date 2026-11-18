-- v25: Super Admin invite toggle + platform-wide profile header templates
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "superAdminCanInvite" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "profileTemplates" JSONB;
