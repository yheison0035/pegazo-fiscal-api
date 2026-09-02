-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DianEnv" AS ENUM ('HABILITACION', 'PRODUCCION');

-- CreateEnum
CREATE TYPE "HabilitacionStatus" AS ENUM ('REGISTRADO', 'EN_PRUEBAS', 'HABILITADO');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('FACTURA_VENTA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'DOCUMENTO_POS', 'NOMINA', 'NOMINA_AJUSTE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('BORRADOR', 'FIRMADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'CONTINGENCIA', 'ERROR');

-- CreateTable
CREATE TABLE "Platform" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "dv" TEXT,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "externalId" TEXT,
    "env" "DianEnv" NOT NULL DEFAULT 'HABILITACION',
    "habilitacion" "HabilitacionStatus" NOT NULL DEFAULT 'REGISTRADO',
    "softwareId" TEXT,
    "softwarePin" TEXT,
    "testSetId" TEXT,
    "certEncrypted" BYTEA,
    "certPassEnc" BYTEA,
    "certExpiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NumberingResolution" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "prefix" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "technicalKey" TEXT,
    "rangeFrom" INTEGER NOT NULL,
    "rangeTo" INTEGER NOT NULL,
    "current" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NumberingResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'BORRADOR',
    "prefix" TEXT,
    "number" INTEGER,
    "fullNumber" TEXT,
    "cufe" TEXT,
    "input" JSONB NOT NULL,
    "xmlSigned" TEXT,
    "dianResponse" JSONB,
    "qrData" TEXT,
    "pdfUrl" TEXT,
    "idempotencyKey" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentEvent" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");

-- CreateIndex
CREATE INDEX "ApiKey_platformId_idx" ON "ApiKey"("platformId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_platformId_idx" ON "WebhookEndpoint"("platformId");

-- CreateIndex
CREATE INDEX "Company_platformId_idx" ON "Company"("platformId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_platformId_nit_key" ON "Company"("platformId", "nit");

-- CreateIndex
CREATE INDEX "NumberingResolution_companyId_documentType_idx" ON "NumberingResolution"("companyId", "documentType");

-- CreateIndex
CREATE INDEX "FiscalDocument_companyId_type_status_idx" ON "FiscalDocument"("companyId", "type", "status");

-- CreateIndex
CREATE INDEX "FiscalDocument_cufe_idx" ON "FiscalDocument"("cufe");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_companyId_idempotencyKey_key" ON "FiscalDocument"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_companyId_type_prefix_number_key" ON "FiscalDocument"("companyId", "type", "prefix", "number");

-- CreateIndex
CREATE INDEX "DocumentEvent_documentId_idx" ON "DocumentEvent"("documentId");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NumberingResolution" ADD CONSTRAINT "NumberingResolution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEvent" ADD CONSTRAINT "DocumentEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FiscalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

