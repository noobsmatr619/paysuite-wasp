-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "portalToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_portalToken_key" ON "Invoice"("portalToken");
