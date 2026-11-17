-- v22: platform-wide gate pass protocol + per-guest, per-gate tag / pass records.
-- CreateEnum
CREATE TYPE "GatePassProtocol" AS ENUM ('PLAIN_TAGS', 'PRINTED_PASS', 'NONE');

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "gatePassProtocol" "GatePassProtocol" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "GatePassItem" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "gateVisitId" TEXT,
    "kind" TEXT NOT NULL,
    "tagNumber" TEXT,
    "destination" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lostReason" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "lastPrintedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatePassItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GatePassItem_visitorId_gateId_status_idx" ON "GatePassItem"("visitorId", "gateId", "status");

-- CreateIndex
CREATE INDEX "GatePassItem_status_gateId_idx" ON "GatePassItem"("status", "gateId");

-- AddForeignKey
ALTER TABLE "GatePassItem" ADD CONSTRAINT "GatePassItem_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePassItem" ADD CONSTRAINT "GatePassItem_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

