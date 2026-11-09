-- AlterTable
ALTER TABLE "Event" ADD COLUMN "checkoutOpensAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN "checkedOutAt" TIMESTAMP(3),
ADD COLUMN "checkedOutById" TEXT,
ADD COLUMN "checkoutDeviceId" TEXT,
ADD COLUMN "checkoutClientScanId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_checkoutClientScanId_key" ON "CheckIn"("checkoutClientScanId");

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
