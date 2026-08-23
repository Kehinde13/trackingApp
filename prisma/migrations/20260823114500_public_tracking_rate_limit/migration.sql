-- CreateTable
CREATE TABLE "PublicTrackingRateLimit" (
    "identityHash" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicTrackingRateLimit_pkey" PRIMARY KEY ("identityHash")
);

-- CreateIndex
CREATE INDEX "PublicTrackingRateLimit_expiresAt_idx" ON "PublicTrackingRateLimit"("expiresAt");
