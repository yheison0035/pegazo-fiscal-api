import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';

/**
 * Motor NORMATIVO DIAN (parametrizable).
 *
 * Responde dos cosas de referencia para cualquier plataforma consumidora:
 *   1. Los parámetros del año (UVT y topes en UVT), editables por fila.
 *   2. La evaluación de un contribuyente: si DEBE declarar renta y qué
 *      obligaciones tiene, a partir de su perfil fiscal (responsabilidades del
 *      RUT) + sus magnitudes anuales (ingresos, patrimonio, etc.).
 *
 * IMPORTANTE — esto NO consulta a la DIAN en vivo. La DIAN no expone un servicio
 * público que diga, por NIT, "usted debe declarar y estas son sus obligaciones";
 * esa información vive en el RUT privado del contribuyente. Aquí calculamos con
 * los parámetros vigentes (editables) y el perfil que envía el consumidor. Cada
 * contribuyente/contador debe validar el resultado contra la norma y su RUT.
 */

// Topes estructurales para que una PERSONA NATURAL deba declarar renta
// (expresados en UVT). Son valores de referencia EDITABLES por año; la norma
// puede ajustarlos por decreto. Ver arts. 592-594 del Estatuto Tributario.
const DEFAULT_RENTA_TOPES_UVT: Record<string, number> = {
  RENTA_TOPE_PATRIMONIO_UVT: 4500,
  RENTA_TOPE_INGRESOS_UVT: 1400,
  RENTA_TOPE_CONSUMOS_TARJETA_UVT: 1400,
  RENTA_TOPE_COMPRAS_UVT: 1400,
  RENTA_TOPE_CONSIGNACIONES_UVT: 1400,
};

// UVT oficiales publicados por la DIAN (resoluciones anuales). Solo cargamos los
// que conocemos con certeza; los años sin dato quedan en 0 para que la
// plataforma los cargue (nunca inventamos el UVT del año).
const KNOWN_UVT: Record<number, number> = {
  2023: 42412,
  2024: 47065,
  2025: 49799,
};

// Tarifa general de renta para personas jurídicas (editable). Referencia.
const DEFAULT_TARIFA_RENTA_JURIDICA = 0.35;

// Tabla marginal de renta para personas naturales (art. 241 ET), en UVT.
// Cada tramo aplica su tarifa a lo que exceda su "fromUvt" hasta el siguiente.
// Editable (se guarda como JSON); es de referencia, verificar el año.
const DEFAULT_TABLA_RENTA_NATURAL = [
  { fromUvt: 0, rate: 0 },
  { fromUvt: 1090, rate: 0.19 },
  { fromUvt: 1700, rate: 0.28 },
  { fromUvt: 4100, rate: 0.33 },
  { fromUvt: 8670, rate: 0.35 },
  { fromUvt: 18970, rate: 0.37 },
  { fromUvt: 31000, rate: 0.39 },
];

const MAG_KEYS = [
  ['patrimonioBruto', 'RENTA_TOPE_PATRIMONIO_UVT', 'Patrimonio bruto'],
  ['ingresosBrutos', 'RENTA_TOPE_INGRESOS_UVT', 'Ingresos brutos'],
  ['consumosTarjeta', 'RENTA_TOPE_CONSUMOS_TARJETA_UVT', 'Consumos con tarjeta de crédito'],
  ['compras', 'RENTA_TOPE_COMPRAS_UVT', 'Compras y consumos'],
  ['consignaciones', 'RENTA_TOPE_CONSIGNACIONES_UVT', 'Consignaciones, depósitos o inversiones'],
] as const;

@Injectable()
export class TaxRulesService {
  constructor(private prisma: PrismaService) {}

  /** Asegura que existan las filas por defecto (nacionales) de un año. */
  private async ensureDefaults(year: number) {
    const existing = await this.prisma.taxRule.findMany({
      where: { platformId: null, year },
      select: { key: true },
    });
    const have = new Set(existing.map((r) => r.key));
    const toCreate: {
      year: number;
      key: string;
      valueNum: number;
      valueJson?: any;
      note: string | null;
    }[] = [];

    if (!have.has('UVT')) {
      toCreate.push({
        year,
        key: 'UVT',
        valueNum: KNOWN_UVT[year] ?? 0,
        note: KNOWN_UVT[year]
          ? 'UVT oficial DIAN. Verificar la resolución del año.'
          : 'PENDIENTE: cargar el UVT del año publicado por la DIAN.',
      });
    }
    for (const [key, uvt] of Object.entries(DEFAULT_RENTA_TOPES_UVT)) {
      if (!have.has(key))
        toCreate.push({
          year,
          key,
          valueNum: uvt,
          note: 'Tope de referencia (arts. 592-594 ET). Verificar el decreto del año.',
        });
    }
    // Tarifas de renta (editables).
    if (!have.has('TARIFA_RENTA_JURIDICA'))
      toCreate.push({
        year,
        key: 'TARIFA_RENTA_JURIDICA',
        valueNum: DEFAULT_TARIFA_RENTA_JURIDICA,
        note: 'Tarifa general renta persona jurídica (referencia). Verificar la norma vigente.',
      });
    if (!have.has('RENTA_TABLA_NATURAL_UVT'))
      toCreate.push({
        year,
        key: 'RENTA_TABLA_NATURAL_UVT',
        valueNum: 0,
        valueJson: DEFAULT_TABLA_RENTA_NATURAL,
        note: 'Tabla marginal renta persona natural en UVT (art. 241 ET, referencia). Verificar el año.',
      });
    if (toCreate.length)
      await this.prisma.taxRule.createMany({ data: toCreate, skipDuplicates: true });
  }

  /** Devuelve el mapa de parámetros del año (override de plataforma > nacional). */
  private async paramsFor(platformId: string, year: number) {
    await this.ensureDefaults(year);
    const rows = await this.prisma.taxRule.findMany({
      where: { year, active: true, OR: [{ platformId: null }, { platformId }] },
    });
    const map: Record<
      string,
      { value: number; json: any; note: string | null; scope: string }
    > = {};
    // Primero los nacionales, luego los de plataforma sobreescriben.
    for (const r of rows.filter((x) => !x.platformId))
      map[r.key] = { value: r.valueNum, json: r.valueJson, note: r.note, scope: 'NACIONAL' };
    for (const r of rows.filter((x) => x.platformId))
      map[r.key] = { value: r.valueNum, json: r.valueJson, note: r.note, scope: 'PLATAFORMA' };
    return map;
  }

  /** GET /tax-rules/parameters?year= — parámetros vigentes (editables). */
  async parameters(platformId: string, year?: number) {
    const y = Number(year) || new Date().getUTCFullYear();
    const map = await this.paramsFor(platformId, y);
    return {
      year: y,
      uvt: map['UVT']?.value || 0,
      parameters: Object.entries(map).map(([key, v]) => ({
        key,
        value: v.value,
        json: v.json ?? null,
        scope: v.scope,
        note: v.note,
      })),
    };
  }

  /** Crea/actualiza un parámetro (override de la plataforma para un año). */
  async upsertParameter(
    platformId: string,
    dto: { year: number; key: string; value: number; json?: any; note?: string },
  ) {
    const year = Number(dto?.year);
    const key = String(dto?.key || '').toUpperCase().trim();
    const value = Number(dto?.value) || 0;
    const json = dto?.json ?? undefined;
    if (!year) throw new BadRequestException('El año es obligatorio.');
    if (!key) throw new BadRequestException('La clave es obligatoria.');
    if (!Number.isFinite(value)) throw new BadRequestException('Valor no válido.');
    const row = await this.prisma.taxRule.upsert({
      where: { platformId_year_key: { platformId, year, key } },
      update: { valueNum: value, valueJson: json, note: dto.note ?? null, active: true },
      create: { platformId, year, key, valueNum: value, valueJson: json, note: dto.note ?? null },
    });
    return { success: true, data: row };
  }

  // Calcula el impuesto de renta a partir de la base gravable (COP).
  // Persona jurídica: base * tarifa (editable). Persona natural: tabla marginal
  // en UVT (editable). Todo de referencia; validar con la norma y el RUT.
  async renta(platformId: string, dto: any) {
    const year = Number(dto?.year) || new Date().getUTCFullYear();
    const personType = String(dto?.personType || 'NATURAL').toUpperCase();
    const base = Math.max(0, Math.round(Number(dto?.baseGravable) || 0));
    const map = await this.paramsFor(platformId, year);
    const uvt = map['UVT']?.value || 0;

    let impuesto = 0;
    const detail: any[] = [];
    let method = '';

    if (personType === 'JURIDICA') {
      const tarifa = map['TARIFA_RENTA_JURIDICA']?.value || DEFAULT_TARIFA_RENTA_JURIDICA;
      impuesto = Math.round(base * tarifa);
      method = 'JURIDICA_TARIFA_PLANA';
      detail.push({ tarifa, base, impuesto });
    } else {
      method = 'NATURAL_TABLA_MARGINAL';
      const tabla: any[] =
        (Array.isArray(map['RENTA_TABLA_NATURAL_UVT']?.json)
          ? map['RENTA_TABLA_NATURAL_UVT']?.json
          : DEFAULT_TABLA_RENTA_NATURAL) || DEFAULT_TABLA_RENTA_NATURAL;
      if (!uvt) {
        // Sin UVT no se puede convertir la base a UVT.
        return {
          success: true,
          data: {
            year,
            personType,
            uvt,
            baseGravable: base,
            impuesto: null,
            method,
            note: `No hay UVT cargado para ${year}; no se puede aplicar la tabla marginal.`,
            disclaimer: this.rentaDisclaimer(),
          },
        };
      }
      const baseUvt = base / uvt;
      const sorted = [...tabla].sort((a, b) => a.fromUvt - b.fromUvt);
      let impUvt = 0;
      for (let i = 0; i < sorted.length; i++) {
        const from = Number(sorted[i].fromUvt) || 0;
        const rate = Number(sorted[i].rate) || 0;
        const upper = i + 1 < sorted.length ? Number(sorted[i + 1].fromUvt) : Infinity;
        const enTramo = Math.max(0, Math.min(baseUvt, upper) - from);
        if (enTramo > 0 && rate > 0) {
          const aporte = enTramo * rate;
          impUvt += aporte;
          detail.push({ desdeUvt: from, tarifa: rate, uvtEnTramo: Math.round(enTramo), aporteUvt: Math.round(aporte) });
        }
      }
      impuesto = Math.round(impUvt * uvt);
    }

    const effectiveRate = base > 0 ? impuesto / base : 0;
    return {
      success: true,
      data: {
        year,
        personType,
        uvt,
        baseGravable: base,
        impuesto,
        effectiveRate,
        method,
        detail,
        disclaimer: this.rentaDisclaimer(),
      },
    };
  }

  private rentaDisclaimer() {
    return 'Impuesto de renta ESTIMADO con parámetros editables sobre la base indicada. No incluye toda la depuración legal (rentas exentas, deducciones, descuentos, cédulas) ni reemplaza la declaración; validar con el contador y la norma vigente.';
  }

  /** Catálogo de responsabilidades del RUT y tipos de obligación (referencia). */
  catalog() {
    return {
      // Responsabilidades del RUT más comunes (casilla 53). El contribuyente las
      // marca según su RUT; de ahí se derivan las obligaciones.
      responsibilities: [
        { code: 'responsableIVA', rut: '48', label: 'Responsable de IVA' },
        { code: 'agenteRetencion', rut: '07', label: 'Agente de retención en la fuente' },
        { code: 'autorretenedor', rut: '15', label: 'Autorretenedor' },
        { code: 'responsableICA', rut: '—', label: 'Responsable de ICA (municipal)' },
        { code: 'granContribuyente', rut: '13', label: 'Gran contribuyente' },
        { code: 'obligadoContabilidad', rut: '42', label: 'Obligado a llevar contabilidad' },
        { code: 'facturadorElectronico', rut: '52', label: 'Facturador electrónico' },
        { code: 'regimenSimple', rut: '47', label: 'Régimen Simple de Tributación (RST)' },
      ],
      personTypes: [
        { code: 'NATURAL', label: 'Persona natural' },
        { code: 'JURIDICA', label: 'Persona jurídica' },
      ],
      regimes: [
        { code: 'ORDINARIO', label: 'Régimen ordinario' },
        { code: 'SIMPLE', label: 'Régimen Simple (RST)' },
        { code: 'NO_RESPONSABLE', label: 'No responsable de IVA' },
      ],
      obligationTypes: [
        { code: 'RENTA', label: 'Declaración de renta' },
        { code: 'SIMPLE', label: 'Régimen Simple (anticipos + anual)' },
        { code: 'IVA', label: 'Declaración de IVA' },
        { code: 'RETEFUENTE', label: 'Retención en la fuente' },
        { code: 'ICA', label: 'Industria y comercio (ICA)' },
        { code: 'EXOGENA', label: 'Información exógena' },
        { code: 'FACT_ELECTRONICA', label: 'Facturación electrónica' },
        { code: 'NOMINA_ELECTRONICA', label: 'Nómina electrónica' },
      ],
    };
  }

  /**
   * Evalúa un contribuyente: ¿debe declarar renta? ¿qué obligaciones tiene?
   * Todo se deriva de parámetros editables + el perfil que envía el consumidor.
   */
  async evaluate(platformId: string, dto: any) {
    const year = Number(dto?.year) || new Date().getUTCFullYear();
    const personType = String(dto?.personType || 'NATURAL').toUpperCase();
    const regime = String(dto?.regime || 'ORDINARIO').toUpperCase();
    const r = dto?.responsibilities || {};
    const mag = dto?.magnitudes || {};
    const map = await this.paramsFor(platformId, year);
    const uvt = map['UVT']?.value || 0;

    // ---- ¿Debe declarar renta? ----
    const rentaReasons: any[] = [];
    let mustDeclareRenta: boolean | null = null;

    if (personType === 'JURIDICA') {
      // Las personas jurídicas del régimen ordinario siempre declaran renta.
      mustDeclareRenta = regime !== 'SIMPLE';
      rentaReasons.push({
        key: 'PERSONA_JURIDICA',
        label:
          regime === 'SIMPLE'
            ? 'Persona jurídica en Régimen Simple: no declara renta ordinaria (declara SIMPLE).'
            : 'Persona jurídica en régimen ordinario: siempre declara renta.',
        exceeded: regime !== 'SIMPLE',
      });
    } else if (regime === 'SIMPLE') {
      mustDeclareRenta = false;
      rentaReasons.push({
        key: 'REGIMEN_SIMPLE',
        label: 'Persona natural en Régimen Simple: no declara renta ordinaria (declara SIMPLE).',
        exceeded: false,
      });
    } else if (!uvt) {
      // Sin UVT del año no podemos evaluar los topes.
      mustDeclareRenta = null;
      rentaReasons.push({
        key: 'SIN_UVT',
        label: `No hay UVT cargado para ${year}. Cárgalo para evaluar los topes de renta.`,
        exceeded: false,
      });
    } else {
      // Persona natural, régimen ordinario: aplica topes en UVT.
      let any = false;
      for (const [magKey, ruleKey, label] of MAG_KEYS) {
        const topeUvt = map[ruleKey]?.value || 0;
        const topeCop = Math.round(topeUvt * uvt);
        const value = Math.round(Number(mag[magKey]) || 0);
        const exceeded = topeCop > 0 && value >= topeCop;
        if (exceeded) any = true;
        rentaReasons.push({
          key: ruleKey,
          label,
          threshold: { uvt: topeUvt, cop: topeCop },
          value,
          exceeded,
        });
      }
      // Ser responsable de IVA también obliga a declarar renta.
      if (r.responsableIVA) {
        any = true;
        rentaReasons.push({
          key: 'RESPONSABLE_IVA',
          label: 'Es responsable de IVA: obligado a declarar renta.',
          exceeded: true,
        });
      }
      mustDeclareRenta = any;
    }

    // ---- Obligaciones derivadas ----
    const note = 'Periodicidad/obligación de referencia; validar con la norma vigente y el RUT.';
    const obligations: any[] = [];
    const add = (code: string, label: string, frequency: string, basis: string) =>
      obligations.push({ code, label, frequency, basis, note });

    if (regime === 'SIMPLE') {
      add('SIMPLE', 'Anticipo bimestral del Régimen Simple', 'BIMESTRAL', 'Régimen Simple (RST)');
      add('SIMPLE', 'Declaración anual del Régimen Simple', 'ANUAL', 'Régimen Simple (RST)');
    }
    if (mustDeclareRenta === true && regime !== 'SIMPLE')
      add(
        'RENTA',
        'Declaración anual de renta y complementarios',
        'ANUAL',
        personType === 'JURIDICA' ? 'Persona jurídica' : 'Supera topes / responsable de IVA',
      );
    if (r.responsableIVA)
      add('IVA', 'Declaración de IVA', 'BIMESTRAL', 'Responsable de IVA (verificar bimestral/cuatrimestral)');
    if (r.agenteRetencion || r.autorretenedor)
      add('RETEFUENTE', 'Declaración de retención en la fuente', 'MENSUAL', 'Agente de retención / autorretenedor');
    if (r.responsableICA)
      add('ICA', 'Industria y comercio (ICA)', 'SEGUN_MUNICIPIO', 'Responsable de ICA (periodicidad municipal)');
    if (r.obligadoContabilidad)
      add('EXOGENA', 'Información exógena (medios magnéticos)', 'ANUAL', 'Obligado a llevar contabilidad (si supera topes)');
    if (r.facturadorElectronico)
      add('FACT_ELECTRONICA', 'Facturación electrónica', 'PERMANENTE', 'Facturador electrónico');

    return {
      success: true,
      data: {
        year,
        uvt,
        personType,
        regime,
        mustDeclareRenta,
        rentaReasons,
        obligations,
        disclaimer:
          'Resultado de referencia calculado con parámetros editables. No es una consulta en vivo a la DIAN; validar con la norma vigente y el RUT del contribuyente.',
      },
    };
  }
}
