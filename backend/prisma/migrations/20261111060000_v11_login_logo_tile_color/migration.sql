-- Per-agency login tile background (null = Auto).
ALTER TABLE "Organisation" ADD COLUMN "loginTileColor" TEXT;

-- Keep an uploaded sign-in logo but optionally hide it above the form.
ALTER TABLE "PlatformSettings" ADD COLUMN "loginLogoVisible" BOOLEAN NOT NULL DEFAULT true;
