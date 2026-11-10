-- CreateTable
CREATE TABLE "DemoSeedRecord" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoSeedRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoSeedRecord_model_idx" ON "DemoSeedRecord"("model");

-- CreateIndex
CREATE UNIQUE INDEX "DemoSeedRecord_model_recordId_key" ON "DemoSeedRecord"("model", "recordId");
