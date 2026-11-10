-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN "requireDispatchHostApproval" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Visitor" ADD COLUMN "passToken" TEXT;
CREATE INDEX "Visitor_passToken_idx" ON "Visitor"("passToken");

-- AlterTable
ALTER TABLE "GateVisit" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'ENTRY';

-- AlterTable
ALTER TABLE "GateParticular" ADD COLUMN "resolution" TEXT;
ALTER TABLE "GateParticular" ADD COLUMN "resolutionNote" TEXT;
ALTER TABLE "GateParticular" ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "GateParticular" ADD COLUMN "resolvedById" TEXT;

-- Backfill previously returned items as resolved
UPDATE "GateParticular"
SET "resolution" = 'RETURNED', "resolvedAt" = "returnedAt", "resolvedById" = "returnedById"
WHERE "returnedAt" IS NOT NULL AND "resolution" IS NULL;

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "loginLogoUrl" TEXT,
    "loginLogoWidth" TEXT DEFAULT '180px',
    "loginWatermarkUrl" TEXT,
    "loginWatermarkWidth" TEXT DEFAULT '70vw',
    "loginWatermarkHeight" TEXT DEFAULT '70vh',
    "loginWatermarkOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
    "loginHeadline" TEXT,
    "loginPrimaryColor" TEXT,
    "loginSecondaryColor" TEXT,
    "footerCredit" TEXT NOT NULL DEFAULT 'Powered by CISTECH''s Vicit 1.0.1',
    "footerCreditEnabled" BOOLEAN NOT NULL DEFAULT true,
    "contractorMinDurationDays" INTEGER NOT NULL DEFAULT 1,
    "assetVersion" TEXT NOT NULL DEFAULT '1.0.1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformSettings" ("id", "updatedAt") VALUES ('platform', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "photoPath" TEXT,
    "organisationId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validThrough" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Contractor_token_key" ON "Contractor"("token");
CREATE UNIQUE INDEX "Contractor_qrToken_key" ON "Contractor"("qrToken");
CREATE INDEX "Contractor_organisationId_validThrough_idx" ON "Contractor"("organisationId", "validThrough");
CREATE INDEX "Contractor_email_idx" ON "Contractor"("email");
CREATE INDEX "Contractor_phone_idx" ON "Contractor"("phone");

ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ContractorVisit" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "destination" TEXT,
    "gateId" TEXT,
    "officerId" TEXT,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "day" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorVisit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContractorVisit_contractorId_day_idx" ON "ContractorVisit"("contractorId", "day");
CREATE INDEX "ContractorVisit_organisationId_day_idx" ON "ContractorVisit"("organisationId", "day");

ALTER TABLE "ContractorVisit" ADD CONSTRAINT "ContractorVisit_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "courierName" TEXT NOT NULL,
    "courierPhone" TEXT,
    "courierCompany" TEXT,
    "photoPath" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "createdById" TEXT NOT NULL,
    "gateId" TEXT,
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Dispatch_createdAt_idx" ON "Dispatch"("createdAt");
CREATE INDEX "Dispatch_status_idx" ON "Dispatch"("status");

-- CreateTable
CREATE TABLE "DispatchItem" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DispatchItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "DispatchDestination" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "hostId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "note" TEXT,

    CONSTRAINT "DispatchDestination_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DispatchDestination_dispatchId_organisationId_key" ON "DispatchDestination"("dispatchId", "organisationId");
CREATE INDEX "DispatchDestination_organisationId_status_idx" ON "DispatchDestination"("organisationId", "status");

ALTER TABLE "DispatchDestination" ADD CONSTRAINT "DispatchDestination_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispatchDestination" ADD CONSTRAINT "DispatchDestination_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "VisitTransfer" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "fromOrganisationId" TEXT NOT NULL,
    "toOrganisationId" TEXT NOT NULL,
    "fromHostId" TEXT NOT NULL,
    "toHostId" TEXT,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitTransfer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VisitTransfer_visitorId_createdAt_idx" ON "VisitTransfer"("visitorId", "createdAt");
CREATE INDEX "VisitTransfer_toOrganisationId_createdAt_idx" ON "VisitTransfer"("toOrganisationId", "createdAt");

ALTER TABLE "VisitTransfer" ADD CONSTRAINT "VisitTransfer_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Relax ring calls so a gate officer can also ring a host about a dispatch
ALTER TABLE "RingCall" ALTER COLUMN "visitorId" DROP NOT NULL;
ALTER TABLE "RingCall" ADD COLUMN "dispatchId" TEXT;
CREATE INDEX "RingCall_dispatchId_idx" ON "RingCall"("dispatchId");
