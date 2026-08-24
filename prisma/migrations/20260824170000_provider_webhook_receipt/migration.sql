-- CreateEnum
CREATE TYPE "ProviderWebhookOutcome" AS ENUM ('PROCESSED', 'UNMATCHED', 'UNSUPPORTED', 'STOPPED');

-- CreateTable
CREATE TABLE "ProviderWebhookReceipt" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "outcome" "ProviderWebhookOutcome" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderWebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderWebhookReceipt_provider_payloadHash_key" ON "ProviderWebhookReceipt"("provider", "payloadHash");
CREATE INDEX "ProviderWebhookReceipt_receivedAt_idx" ON "ProviderWebhookReceipt"("receivedAt");
CREATE INDEX "ProviderWebhookReceipt_processedAt_idx" ON "ProviderWebhookReceipt"("processedAt");
