ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "portalToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Estimate_portalToken_key" ON "Estimate"("portalToken");

CREATE TABLE IF NOT EXISTS "CmsFaq" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "CmsFaq_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CmsTestimonial" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "quote" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "CmsTestimonial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CmsSiteContent" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "CmsSiteContent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CmsSiteContent_key_key" ON "CmsSiteContent"("key");
