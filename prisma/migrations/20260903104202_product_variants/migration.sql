-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('SIMPLE', 'VARIANT', 'MADE_TO_ORDER', 'BY_LENGTH');

-- CreateEnum
CREATE TYPE "ProductSize" AS ENUM ('XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'ONE_SIZE');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "measurements" JSONB,
ADD COLUMN     "variantId" TEXT,
ADD COLUMN     "variantLabel" TEXT,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'SIMPLE',
ADD COLUMN     "minQuantity" DOUBLE PRECISION,
ADD COLUMN     "productionDays" INTEGER,
ADD COLUMN     "requiredMeasurements" TEXT[],
ADD COLUMN     "unitLabel" TEXT;

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" "ProductSize",
    "sizeLabel" TEXT,
    "colorName" TEXT,
    "colorHex" TEXT,
    "weight" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION,
    "stock" INTEGER,
    "images" TEXT[],
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_variants_productId_isAvailable_idx" ON "product_variants"("productId", "isAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_productId_size_colorName_key" ON "product_variants"("productId", "size", "colorName");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

