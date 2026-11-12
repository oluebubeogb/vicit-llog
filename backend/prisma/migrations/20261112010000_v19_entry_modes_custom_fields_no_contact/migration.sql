-- AlterTable
ALTER TABLE "User" ADD COLUMN     "customFields" JSONB;

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "hostConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "postponeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "postponedAt" TIMESTAMP(3),
ADD COLUMN     "reminderDaySentAt" TIMESTAMP(3),
ADD COLUMN     "reminderHourSentAt" TIMESTAMP(3),
ADD COLUMN     "vehicleDetails" TEXT,
ADD COLUMN     "vehiclePlate" TEXT;

-- AlterTable
ALTER TABLE "Visitor" ADD COLUMN     "gatePhotoPath" TEXT,
ADD COLUMN     "identityRequestedAt" TIMESTAMP(3),
ADD COLUMN     "identityRequestedById" TEXT,
ADD COLUMN     "identityReviewedAt" TIMESTAMP(3),
ADD COLUMN     "identityReviewedById" TEXT,
ADD COLUMN     "identityStatus" TEXT,
ADD COLUMN     "vehicleDetails" TEXT,
ADD COLUMN     "vehiclePlate" TEXT;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "allowedEntryModes" TEXT[] DEFAULT ARRAY['PEDESTRIAN', 'MOTORCYCLE', 'VEHICLE']::TEXT[];

-- CreateTable
CREATE TABLE "AgencyCustomField" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgencyCustomField_organisationId_isActive_idx" ON "AgencyCustomField"("organisationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyCustomField_organisationId_key_key" ON "AgencyCustomField"("organisationId", "key");

-- CreateIndex
CREATE INDEX "Invite_expectedAt_idx" ON "Invite"("expectedAt");

-- AddForeignKey
ALTER TABLE "AgencyCustomField" ADD CONSTRAINT "AgencyCustomField_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

