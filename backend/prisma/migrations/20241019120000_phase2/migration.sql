-- Phase 2 extensions

-- AlterEnum
ALTER TYPE "InviteStatus" ADD VALUE IF NOT EXISTS 'AWAITING_APPROVAL';
ALTER TYPE "VisitStatus" ADD VALUE IF NOT EXISTS 'DENIED';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WorkflowType" AS ENUM ('NONE', 'HOST_ONLY', 'MANAGER_THEN_HOST', 'SECURITY_THEN_HOST');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Organisation white-label & settings
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "primaryColor" TEXT DEFAULT '#2563eb';
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "secondaryColor" TEXT DEFAULT '#1e40af';
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "customDomain" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "requireApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "defaultWorkflow" "WorkflowType" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "photoRetentionDays" INTEGER NOT NULL DEFAULT 90;

-- User permissions
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Invite extras
ALTER TABLE "Invite" ADD COLUMN IF NOT EXISTS "locationId" TEXT;
ALTER TABLE "Invite" ADD COLUMN IF NOT EXISTS "workflowState" TEXT;

-- Visitor extras
ALTER TABLE "Visitor" ADD COLUMN IF NOT EXISTS "gateId" TEXT;
ALTER TABLE "Visitor" ADD COLUMN IF NOT EXISTS "idNumber" TEXT;
ALTER TABLE "Visitor" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- Notification channel
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'in_app';

-- Location
CREATE TABLE IF NOT EXISTS "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "organisationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Location_organisationId_code_key" ON "Location"("organisationId", "code");
ALTER TABLE "Location" DROP CONSTRAINT IF EXISTS "Location_organisationId_fkey";
ALTER TABLE "Location" ADD CONSTRAINT "Location_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Gate
CREATE TABLE IF NOT EXISTS "Gate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Gate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Gate_locationId_code_key" ON "Gate"("locationId", "code");
ALTER TABLE "Gate" DROP CONSTRAINT IF EXISTS "Gate_locationId_fkey";
ALTER TABLE "Gate" ADD CONSTRAINT "Gate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Blacklist
CREATE TABLE IF NOT EXISTS "BlacklistEntry" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "fullName" TEXT,
    "idNumber" TEXT,
    "phone" TEXT,
    "reason" TEXT NOT NULL,
    "photoPath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlacklistEntry_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "BlacklistEntry" DROP CONSTRAINT IF EXISTS "BlacklistEntry_organisationId_fkey";
ALTER TABLE "BlacklistEntry" ADD CONSTRAINT "BlacklistEntry_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ApprovalWorkflow
CREATE TABLE IF NOT EXISTS "ApprovalWorkflow" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkflowType" NOT NULL DEFAULT 'HOST_ONLY',
    "steps" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApprovalWorkflow_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ApprovalWorkflow" DROP CONSTRAINT IF EXISTS "ApprovalWorkflow_organisationId_fkey";
ALTER TABLE "ApprovalWorkflow" ADD CONSTRAINT "ApprovalWorkflow_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
