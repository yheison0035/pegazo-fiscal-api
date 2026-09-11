-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "platformId" TEXT,
    "year" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "valueNum" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxRule_year_key_idx" ON "TaxRule"("year", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRule_platformId_year_key_key" ON "TaxRule"("platformId", "year", "key");
