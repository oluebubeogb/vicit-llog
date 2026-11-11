-- Organisation login grid
ALTER TABLE "Organisation" ADD COLUMN "loginOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organisation" ADD COLUMN "loginVisible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organisation" ADD COLUMN "shortName" TEXT;

-- Platform login title
ALTER TABLE "PlatformSettings" ADD COLUMN "loginTitle" TEXT DEFAULT 'Defence Headquarters';
UPDATE "PlatformSettings" SET "loginTitle" = COALESCE(NULLIF("loginTitle", ''), 'Defence Headquarters') WHERE "id" = 'platform';

-- Contractor cycle + termination
ALTER TABLE "Contractor" ADD COLUMN "cycle" TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE "Contractor" ADD COLUMN "terminatedAt" TIMESTAMP(3);
ALTER TABLE "Contractor" ADD COLUMN "terminatedReason" TEXT;
ALTER TABLE "Contractor" ADD COLUMN "terminatedById" TEXT;

-- Many-to-many contractor agencies
CREATE TABLE "ContractorOrganisation" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractorOrganisation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractorOrganisation_contractorId_organisationId_key" ON "ContractorOrganisation"("contractorId", "organisationId");
CREATE INDEX "ContractorOrganisation_organisationId_idx" ON "ContractorOrganisation"("organisationId");

ALTER TABLE "ContractorOrganisation" ADD CONSTRAINT "ContractorOrganisation_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractorOrganisation" ADD CONSTRAINT "ContractorOrganisation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing single-agency attachments
INSERT INTO "ContractorOrganisation" ("id", "contractorId", "organisationId", "createdAt")
SELECT md5('ctr-org-' || "id") || substr("id", 1, 8), "id", "organisationId", "createdAt" FROM "Contractor";

-- Who the contractor is visiting
ALTER TABLE "ContractorVisit" ADD COLUMN "hostId" TEXT;

-- Dispatch receipt acknowledgement
ALTER TABLE "DispatchDestination" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "DispatchDestination" ADD COLUMN "acknowledgedById" TEXT;
ALTER TABLE "DispatchDestination" ADD COLUMN "acknowledgeComment" TEXT;
