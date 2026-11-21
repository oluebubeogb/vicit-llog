-- v31: host notification sound preference + one-time overstay alert flag
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notificationSound" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Visitor" ADD COLUMN IF NOT EXISTS "overstayNotifiedAt" TIMESTAMP(3);
-- Do not alert hosts on upgrade about guests whose visit had already ended (stale records).
UPDATE "Visitor" v SET "overstayNotifiedAt" = NOW()
  FROM "Invite" i
 WHERE v."inviteId" = i.id AND v."status" = 'ARRIVED' AND v."overstayNotifiedAt" IS NULL AND i."expiresAt" < NOW();
