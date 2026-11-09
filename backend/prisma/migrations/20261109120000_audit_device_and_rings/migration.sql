-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "userAgent" TEXT;

-- CreateTable
CREATE TABLE "RingCall" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RINGING',
    "gateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "RingCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RingCall_toUserId_status_idx" ON "RingCall"("toUserId", "status");

-- CreateIndex
CREATE INDEX "RingCall_fromUserId_status_idx" ON "RingCall"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "RingCall_visitorId_createdAt_idx" ON "RingCall"("visitorId", "createdAt");

-- AddForeignKey
ALTER TABLE "RingCall" ADD CONSTRAINT "RingCall_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
