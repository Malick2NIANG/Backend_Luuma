-- CreateTable
CREATE TABLE "follows" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "merchantId" TEXT,
    "gpId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follows_merchantId_idx" ON "follows"("merchantId");

-- CreateIndex
CREATE INDEX "follows_gpId_idx" ON "follows"("gpId");

-- CreateIndex
CREATE UNIQUE INDEX "follows_followerId_merchantId_key" ON "follows"("followerId", "merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "follows_followerId_gpId_key" ON "follows"("followerId", "gpId");

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_gpId_fkey" FOREIGN KEY ("gpId") REFERENCES "gps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
