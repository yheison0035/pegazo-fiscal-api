import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { create } from 'xmlbuilder2';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { CryptoService } from '@/common/crypto.service';
import { SigningService } from '@/signing/signing.service';
import { calcCune } from './cune.util';
import { CreatePayrollDto } from './dto/create-payroll.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class PayrollService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private signing: SigningService,
  ) {}

  async create(platformId: string, dto: CreatePayrollDto) {
    const company = await this.prisma.company.findFirst({
      where: { id: dto.companyId, platformId },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada.');
    if (!dto.employee?.identification)
      throw new BadRequestException('Falta la identificación del empleado.');

    if (dto.idempotencyKey) {
      const prev = await this.prisma.fiscalDocument.findUnique({
        where: {
          companyId_idempotencyKey: {
            companyId: company.id,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });
      if (prev) return this.present(prev);
    }

    // Numeración de nómina (si hay resolución) o consecutivo simple.
    const resolution = await this.prisma.numberingResolution.findFirst({
      where: { companyId: company.id, documentType: DocumentType.NOMINA, active: true },
      orderBy: { createdAt: 'desc' },
    });
    const count = await this.prisma.fiscalDocument.count({
      where: { companyId: company.id, type: DocumentType.NOMINA },
    });
    const number = resolution ? resolution.current : count + 1;
    const prefix = resolution?.prefix || 'NOM';
    const fullNumber = `${prefix}${number}`;

    const totalDevengado = round2(
      (dto.earnings || []).reduce((s, e) => s + (e.amount || 0), 0),
    );
    const totalDeducciones = round2(
      (dto.deductions || []).reduce((s, d) => s + (d.amount || 0), 0),
    );
    const totalPagar = round2(totalDevengado - totalDeducciones);

    const now = new Date();
    const fecha = now.toISOString().slice(0, 10);
    const hora = now.toTimeString().slice(0, 8) + '-05:00';
    const ambiente = company.env === 'PRODUCCION' ? 1 : 2;

    const cune = calcCune({
      numero: fullNumber,
      fecha,
      hora,
      totalDevengado,
      totalDeducciones,
      totalPagar,
      nitEmpleador: company.nit,
      documentoEmpleado: dto.employee.identification,
      ambiente,
      softwarePin: company.softwarePin || '',
    });

    const xml = this.buildXml({
      cune,
      ambiente,
      fullNumber,
      fecha,
      hora,
      company,
      dto,
      totalDevengado,
      totalDeducciones,
      totalPagar,
    });

    let finalXml = xml;
    let status: 'BORRADOR' | 'FIRMADO' = 'BORRADOR';
    if (company.certEncrypted && company.certPassEnc) {
      try {
        const p12 = this.crypto.decrypt(Buffer.from(company.certEncrypted));
        const password = this.crypto.decryptString(
          Buffer.from(company.certPassEnc),
        );
        finalXml = this.signing.signInvoiceXml(xml, { p12, password });
        status = 'FIRMADO';
      } catch (e: any) {
        throw new BadRequestException(
          `No se pudo firmar la nómina: ${e.message}`,
        );
      }
    }

    const doc = await this.prisma.fiscalDocument.create({
      data: {
        companyId: company.id,
        type: DocumentType.NOMINA,
        status,
        prefix,
        number,
        fullNumber,
        cufe: cune, // se reutiliza el campo para el CUNE
        input: dto as unknown as object,
        xmlSigned: finalXml,
        idempotencyKey: dto.idempotencyKey,
      },
    });
    if (resolution) {
      await this.prisma.numberingResolution.update({
        where: { id: resolution.id },
        data: { current: { increment: 1 } },
      });
    }
    return this.present(doc);
  }

  /**
   * XML del DSPNE (NominaIndividual). Estructura base con Periodo, Empleador,
   * Trabajador, Devengados, Deducciones y totales. Los códigos exactos de cada
   * concepto y el bloque de firma XAdES se afinan en habilitación con el anexo.
   */
  private buildXml(p: any): string {
    const { dto, company, totalDevengado, totalDeducciones, totalPagar } = p;
    const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele(
      'NominaIndividual',
      {
        xmlns: 'dian:gov:co:facturaelectronica:NominaIndividual',
        'xmlns:ext':
          'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      },
    );
    doc.ele('ext:UBLExtensions').ele('ext:UBLExtension').ele('ext:ExtensionContent').up().up().up();

    doc.ele('Novedad').txt('false').up();
    const period = doc.ele('Periodo', {
      FechaIngreso: dto.employee.startDate || dto.period.startDate,
      FechaLiquidacionInicio: dto.period.startDate,
      FechaLiquidacionFin: dto.period.endDate,
    });
    period.up();

    doc.ele('NumeroSecuenciaXML', {
      Numero: p.fullNumber,
      Prefijo: p.prefix || 'NOM',
    }).up();

    doc.ele('InformacionGeneral', {
      Version: 'V1.0: Documento Soporte de Pago de Nómina Electrónica',
      Ambiente: String(p.ambiente),
      TipoXML: '102',
      CUNE: p.cune,
      EncripCUNE: 'CUNE-SHA384',
      FechaGen: p.fecha,
      HoraGen: p.hora,
      PeriodoNomina: '5',
      TipoMoneda: 'COP',
    }).up();

    // Empleador
    doc.ele('Empleador', {
      NIT: company.nit,
      RazonSocial: company.businessName || company.legalName,
    }).up();

    // Trabajador
    doc.ele('Trabajador', {
      TipoDocumento: dto.employee.idType || '13',
      NumeroDocumento: dto.employee.identification,
      PrimerApellido: '',
      PrimerNombre: dto.employee.name,
      Cargo: dto.employee.position || '',
      SalarioIntegral: 'false',
      Sueldo: (dto.employee.salary || 0).toFixed(2),
    }).up();

    // Devengados
    const dev = doc.ele('Devengados');
    (dto.earnings || []).forEach((e: any) => {
      dev.ele('Devengado', {
        Concepto: e.concept,
        Codigo: e.code || '',
        Valor: (e.amount || 0).toFixed(2),
      }).up();
    });
    dev.up();

    // Deducciones
    const ded = doc.ele('Deducciones');
    (dto.deductions || []).forEach((d: any) => {
      ded.ele('Deduccion', {
        Concepto: d.concept,
        Codigo: d.code || '',
        Valor: (d.amount || 0).toFixed(2),
      }).up();
    });
    ded.up();

    doc.ele('DevengadosTotal').txt(totalDevengado.toFixed(2)).up();
    doc.ele('DeduccionesTotal').txt(totalDeducciones.toFixed(2)).up();
    doc.ele('ComprobanteTotal').txt(totalPagar.toFixed(2)).up();

    return doc.end({ prettyPrint: false });
  }

  /**
   * Nota de ajuste de nómina. mode 'ELIMINACION' borra la nómina mal enviada;
   * 'REEMPLAZO' la reemplaza con datos corregidos (dto con la nómina nueva).
   */
  async adjust(
    platformId: string,
    originalId: string,
    mode: 'ELIMINACION' | 'REEMPLAZO',
    dto?: CreatePayrollDto,
    reason?: string,
  ) {
    const original = await this.prisma.fiscalDocument.findFirst({
      where: { id: originalId, company: { platformId }, type: DocumentType.NOMINA },
    });
    if (!original || !original.cufe)
      throw new NotFoundException('Nómina original no encontrada.');
    const company = await this.prisma.company.findUnique({
      where: { id: original.companyId },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada.');
    const originalInput = (original.input as any) || {};
    // En reemplazo se usan los datos nuevos; en eliminación, los del original.
    const src: CreatePayrollDto =
      mode === 'REEMPLAZO' && dto ? dto : (originalInput as CreatePayrollDto);

    const totalDevengado = round2(
      (src.earnings || []).reduce((s, e) => s + (e.amount || 0), 0),
    );
    const totalDeducciones = round2(
      (src.deductions || []).reduce((s, d) => s + (d.amount || 0), 0),
    );
    const totalPagar = round2(totalDevengado - totalDeducciones);

    const count = await this.prisma.fiscalDocument.count({
      where: { companyId: company.id, type: DocumentType.NOMINA_AJUSTE },
    });
    const number = count + 1;
    const prefix = 'NA';
    const fullNumber = `${prefix}${number}`;
    const now = new Date();
    const fecha = now.toISOString().slice(0, 10);
    const hora = now.toTimeString().slice(0, 8) + '-05:00';
    const ambiente = company.env === 'PRODUCCION' ? 1 : 2;

    const cune = calcCune({
      numero: fullNumber,
      fecha,
      hora,
      totalDevengado: mode === 'ELIMINACION' ? 0 : totalDevengado,
      totalDeducciones: mode === 'ELIMINACION' ? 0 : totalDeducciones,
      totalPagar: mode === 'ELIMINACION' ? 0 : totalPagar,
      nitEmpleador: company.nit,
      documentoEmpleado: src.employee?.identification || '',
      ambiente,
      softwarePin: company.softwarePin || '',
    });

    const xml = this.buildAdjustmentXml({
      mode,
      cune,
      cunePredecesor: original.cufe,
      numeroPredecesor: original.fullNumber,
      ambiente,
      fullNumber,
      prefix,
      fecha,
      hora,
      company,
      src,
      totalDevengado,
      totalDeducciones,
      totalPagar,
      reason,
    });

    let finalXml = xml;
    let status: 'BORRADOR' | 'FIRMADO' = 'BORRADOR';
    if (company.certEncrypted && company.certPassEnc) {
      try {
        const p12 = this.crypto.decrypt(Buffer.from(company.certEncrypted));
        const password = this.crypto.decryptString(
          Buffer.from(company.certPassEnc),
        );
        finalXml = this.signing.signInvoiceXml(xml, { p12, password });
        status = 'FIRMADO';
      } catch (e: any) {
        throw new BadRequestException(
          `No se pudo firmar la nota de ajuste: ${e.message}`,
        );
      }
    }

    const doc = await this.prisma.fiscalDocument.create({
      data: {
        companyId: company.id,
        type: DocumentType.NOMINA_AJUSTE,
        status,
        prefix,
        number,
        fullNumber,
        cufe: cune,
        input: {
          mode,
          originalId,
          reason: reason || null,
          ...(mode === 'REEMPLAZO' ? { payroll: src } : {}),
        } as unknown as object,
        xmlSigned: finalXml,
      },
    });
    return { ...this.present(doc), mode, replaces: original.fullNumber };
  }

  private buildAdjustmentXml(p: any): string {
    const { mode, src, company } = p;
    const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele(
      'NominaIndividualDeAjuste',
      {
        xmlns: 'dian:gov:co:facturaelectronica:NominaIndividualDeAjuste',
        'xmlns:ext':
          'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      },
    );
    doc.ele('ext:UBLExtensions').ele('ext:UBLExtension').ele('ext:ExtensionContent').up().up().up();

    // Reemplazar / Eliminar: referencia al documento predecesor por su CUNE.
    if (mode === 'REEMPLAZO') {
      doc.ele('Reemplazar', {
        CUNEReemplazar: p.cunePredecesor,
        NumeroPredecesor: p.numeroPredecesor,
      }).up();
    } else {
      doc.ele('Eliminar', {
        CUNE: p.cunePredecesor,
        NumeroPredecesor: p.numeroPredecesor,
      }).up();
    }

    doc.ele('NumeroSecuenciaXML', { Numero: p.fullNumber, Prefijo: p.prefix }).up();
    doc.ele('InformacionGeneral', {
      Version: 'V1.0: Nota de Ajuste de Nómina Electrónica',
      Ambiente: String(p.ambiente),
      TipoXML: '103',
      CUNE: p.cune,
      EncripCUNE: 'CUNE-SHA384',
      FechaGen: p.fecha,
      HoraGen: p.hora,
      TipoNota: mode === 'REEMPLAZO' ? '1' : '2', // 1 reemplazo, 2 eliminación
      TipoMoneda: 'COP',
    }).up();
    doc.ele('Empleador', {
      NIT: company.nit,
      RazonSocial: company.businessName || company.legalName,
    }).up();
    doc.ele('Trabajador', {
      TipoDocumento: src.employee?.idType || '13',
      NumeroDocumento: src.employee?.identification || '',
      PrimerNombre: src.employee?.name || '',
    }).up();

    if (mode === 'REEMPLAZO') {
      const dev = doc.ele('Devengados');
      (src.earnings || []).forEach((e: any) =>
        dev.ele('Devengado', { Concepto: e.concept, Valor: (e.amount || 0).toFixed(2) }).up(),
      );
      dev.up();
      const ded = doc.ele('Deducciones');
      (src.deductions || []).forEach((d: any) =>
        ded.ele('Deduccion', { Concepto: d.concept, Valor: (d.amount || 0).toFixed(2) }).up(),
      );
      ded.up();
      doc.ele('DevengadosTotal').txt(p.totalDevengado.toFixed(2)).up();
      doc.ele('DeduccionesTotal').txt(p.totalDeducciones.toFixed(2)).up();
      doc.ele('ComprobanteTotal').txt(p.totalPagar.toFixed(2)).up();
    }
    return doc.end({ prettyPrint: false });
  }

  async get(platformId: string, id: string) {
    const doc = await this.prisma.fiscalDocument.findFirst({
      where: { id, company: { platformId }, type: DocumentType.NOMINA },
    });
    if (!doc) throw new NotFoundException('Documento de nómina no encontrado.');
    return this.present(doc);
  }

  private present(doc: any) {
    const input = (doc.input as any) || {};
    return {
      id: doc.id,
      type: doc.type,
      status: doc.status,
      number: doc.fullNumber,
      cune: doc.cufe,
      employee: input.employee?.name || null,
      xml: doc.xmlSigned,
      createdAt: doc.createdAt,
    };
  }
}
