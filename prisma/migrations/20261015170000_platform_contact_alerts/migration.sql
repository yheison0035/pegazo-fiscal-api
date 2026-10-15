-- Contacto del consumidor + banderas de avisos de consumo (recarga).
ALTER TABLE "Platform" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
ALTER TABLE "Platform" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "Platform" ADD COLUMN IF NOT EXISTS "warned80" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Platform" ADD COLUMN IF NOT EXISTS "warned100" BOOLEAN NOT NULL DEFAULT false;
