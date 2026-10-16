-- Configuración del Proveedor Tecnológico (Pegazo). Singleton id='pt'.
CREATE TABLE IF NOT EXISTS "PtConfig" (
  "id" TEXT NOT NULL DEFAULT 'pt',
  "nit" TEXT,
  "dv" TEXT,
  "legalName" TEXT,
  "softwareId" TEXT,
  "softwarePin" TEXT,
  "testSetId" TEXT,
  "env" TEXT NOT NULL DEFAULT 'HABILITACION',
  "certEncrypted" BYTEA,
  "certPassEnc" BYTEA,
  "certExpiresAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PtConfig_pkey" PRIMARY KEY ("id")
);
