# Pruebas — reglas del proyecto (API fiscal)

Aquí un error cuesta un rechazo de la DIAN. Un cambio **no está terminado** hasta que:

1. Todo cálculo determinista (CUFE/CUDE, totales, redondeos, UBL) tiene **tests con vectores fijos** — plantilla: `src/ubl/cufe.util.spec.ts`.
2. Los servicios se prueban con **Prisma y HTTP simulados** (sin red ni BD).
3. Cualquier cambio en XML/firma se valida contra un documento de referencia guardado en el repo.
4. **CI en verde** (`.github/workflows/ci.yml` corre tests + build en cada push/PR).

## Comandos

`npm test` · `npm run test:watch` · `npm run test:cov` · `npm run test:ci`
