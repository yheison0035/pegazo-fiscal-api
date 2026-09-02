# Pegazo Fiscal API

API REST propia de Pegazo para **facturación y nómina electrónica** directo contra la **DIAN** (Colombia), sin intermediario que cobre por documento.

Modelo legal: **Casa de Software** — cada empresa cliente se habilita ante la DIAN como *Software Propio* (su NIT, su certificado). La responsabilidad fiscal es de cada empresa; Pegazo (y otras plataformas) solo consumen esta API.

## Arquitectura

Servicio **independiente** del backend del CRM. El CRM Pegazo es su primer cliente vía API key; en el futuro otras plataformas se conectan igual.

```
CRM Pegazo ─┐
            ├─ API key ─►  Pegazo Fiscal API  ─►  DIAN (web services SOAP)
Otra app ───┘              (UBL · CUFE · XAdES)
```

Multi-tenant en dos niveles: **Platform** (consumidor de la API) → **Company** (un NIT) → **FiscalDocument**.

## Stack

NestJS 11 · Prisma 6 · PostgreSQL. Alias de imports `@/*`. Igual convención que el backend del CRM.

## Puesta en marcha

```bash
cp .env.example .env
# Genera la clave de cifrado de certificados:
openssl rand -hex 32   # pégala en CERT_ENCRYPTION_KEY
npm install
npx prisma migrate dev --name init
npm run start:dev
# Crea la primera plataforma + API key:
npx ts-node scripts/create-platform.ts "Pegazo CRM"
```

## API (v1)

Todas las rutas cuelgan de `/v1` y exigen `Authorization: Bearer pgz_...`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET  | `/v1/health` | Estado del servicio (sin auth) |
| POST | `/v1/companies` | Registra una empresa (NIT) |
| GET  | `/v1/companies` · `/v1/companies/:id` | Lista / detalle |
| POST | `/v1/companies/:id/certificate` | Sube el `.p12` (base64) — se cifra en reposo |
| POST | `/v1/companies/:id/resolutions` | Registra una resolución de numeración |
| POST | `/v1/invoices` | Emite una factura (genera UBL + CUFE) |
| GET  | `/v1/invoices/:id` | Consulta una factura |

## Estado por fase

- **F1 (hoy):** contrato REST versionado, auth por API key, modelo de datos, cifrado de certificados, generación **UBL 2.1** + cálculo **CUFE/CUDE** (SHA-384), idempotencia, numeración por resolución. ✅ compila.
- **F2 (habilitación):** firma **XAdES-EPES** (`signing`) + consumo **SOAP** DIAN (`dian`) con un certificado real; pasar el set de pruebas (2 FV + 1 ND + 1 NC).
- **F3:** representación gráfica (PDF + QR), contingencia, almacenamiento legal, webhooks.
- **F5:** documento equivalente POS. **F6:** nómina electrónica (reusa el motor).

Los servicios `signing` y `dian` tienen la interfaz definida y lanzan un error explícito hasta que se implementen en F2 contra el certificado real.

## Seguridad

- Los certificados `.p12` y sus claves se guardan **cifrados AES-256-GCM** (`CERT_ENCRYPTION_KEY`). Nunca se exponen por la API ni se suben al repo (ver `.gitignore`).
- Las API keys se guardan solo como **hash** (prefijo visible + hash del secreto).
