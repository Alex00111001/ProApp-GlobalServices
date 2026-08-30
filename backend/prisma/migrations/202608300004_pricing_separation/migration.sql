-- CreateEnum
CREATE TYPE "PlatformFeeState" AS ENUM ('PENDING', 'EARNED', 'REFUNDABLE', 'PARTIALLY_REFUNDABLE', 'NON_REFUNDABLE', 'REFUNDED', 'REVERSED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "platformFeeState" "PlatformFeeState" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "pricingPolicyId" TEXT,
ADD COLUMN     "pricingSnapshot" JSONB,
ADD COLUMN     "professionalCommission" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "serviceAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- CreateIndex
CREATE INDEX "Booking_pricingPolicyId_idx" ON "Booking"("pricingPolicyId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_pricingPolicyId_fkey" FOREIGN KEY ("pricingPolicyId") REFERENCES "PricingPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
