-- Valores estructurados para reglas (ej. tabla marginal de renta natural).
ALTER TABLE "TaxRule" ADD COLUMN "valueJson" JSONB;
