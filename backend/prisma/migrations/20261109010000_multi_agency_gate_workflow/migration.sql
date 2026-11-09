ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'GLOBAL_ADMIN';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'GLOBAL_GATE';
ALTER TABLE "Gate" ADD COLUMN IF NOT EXISTS "sequence" INTEGER NOT NULL DEFAULT 0;
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "locationId" ORDER BY "createdAt", "id")::integer - 1 AS seq
  FROM "Gate"
)
UPDATE "Gate" AS g SET "sequence" = ordered.seq FROM ordered WHERE g."id" = ordered."id";
CREATE TABLE "GateOfficerAssignment" (
  "id" TEXT NOT NULL, "gateId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GateOfficerAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GateOfficerAssignment_gateId_userId_key" ON "GateOfficerAssignment"("gateId", "userId");
CREATE INDEX "GateOfficerAssignment_userId_idx" ON "GateOfficerAssignment"("userId");
ALTER TABLE "GateOfficerAssignment" ADD CONSTRAINT "GateOfficerAssignment_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GateOfficerAssignment" ADD CONSTRAINT "GateOfficerAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "GateVisit" (
  "id" TEXT NOT NULL, "visitorId" TEXT NOT NULL, "gateId" TEXT NOT NULL, "officerId" TEXT NOT NULL,
  "decision" TEXT NOT NULL, "notes" TEXT, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GateVisit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GateVisit_visitorId_occurredAt_idx" ON "GateVisit"("visitorId", "occurredAt");
CREATE INDEX "GateVisit_gateId_occurredAt_idx" ON "GateVisit"("gateId", "occurredAt");
ALTER TABLE "GateVisit" ADD CONSTRAINT "GateVisit_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GateVisit" ADD CONSTRAINT "GateVisit_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GateVisit" ADD CONSTRAINT "GateVisit_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "GateParticular" (
  "id" TEXT NOT NULL, "gateVisitId" TEXT NOT NULL, "kind" TEXT NOT NULL, "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1, "imagePath" TEXT, "returnedAt" TIMESTAMP(3),
  "returnedById" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GateParticular_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GateParticular_gateVisitId_idx" ON "GateParticular"("gateVisitId");
ALTER TABLE "GateParticular" ADD CONSTRAINT "GateParticular_gateVisitId_fkey" FOREIGN KEY ("gateVisitId") REFERENCES "GateVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GateParticular" ADD CONSTRAINT "GateParticular_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
