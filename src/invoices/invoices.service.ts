import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { CryptoService } from '@/common/crypto.service';
import { UblService } from '@/ubl/ubl.service';
import { SigningService } from '@/signing/signing.service';
import { RepresentationService } from '@/representation/representation.service';
import { CreateInvoiceDto, InvoiceLineDto } from './dto/create-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private ubl: UblService,
    private signing: SigningService,
    private crypto: CryptoService,
    private representation: RepresentationService,
  ) {}

  async create(platformId: string, dto: CreateInvoiceDto) {
    const company = await this.prisma.company.findFirst({
      where: { id: dto.companyId, platformId },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada.');
    if (!dto.lines?.length)
      throw new BadRequestException('La factura no tiene lineas.');

    // Idempotencia: si ya emitimos con esa clave, devolvemos la misma factura.
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

    // Documento equivalente POS o factura de venta.
    const isPos = dto.documentType === 'DOCUMENTO_POS';
    const docType = isPos
      ? DocumentType.DOCUMENTO_POS
      : DocumentType.FACTURA_VENTA;

    // Resolucion de numeracion vigente para el tipo.
    const resolution = await this.prisma.numberingResolution.findFirst({
      where: { companyId: company.id, documentType: docType, active: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!resolution)
      throw new BadRequestException(
        `La empresa no tiene resolucion de numeracion para ${isPos ? 'documento POS' : 'factura de venta'}.`,
      );
    if (resolution.current > resolution.rangeTo)
      throw new BadRequestException('Se agoto el rango de numeracion autorizado.');

    const totals = this.computeTotals(dto.lines);
    const number = resolution.current;
    const fullNumber = `${resolution.prefix}${number}`;
    const now = new Date();
    const issueDate = now.toISOString().slice(0, 10);
    const issueTime = now.toTimeString().slice(0, 8) + '-05:00';
    const ambiente = company.env === 'PRODUCCION' ? 1 : 2;

    // Genera el UBL 2.1 + CUFE (funcional hoy). Firma y transmision = Fase 2.
    const { xml, cufe } = this.ubl.buildInvoice({
      ambiente,
      nitOFE: company.nit,
      claveTecnica: resolution.technicalKey || '',
      supplierName: company.legalName,
      customerName: dto.customer.name,
      customerId: dto.customer.identification,
      fullNumber,
      issueDate,
      issueTime,
      lines: dto.lines.map((l) => ({
        description: l.description,
        code: l.code,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: l.vatRate ?? 0,
      })),
      totals,
      notes: dto.notes,
      pos: isPos,
      pin: company.softwarePin || '',
    });

    // Si la empresa ya tiene certificado, firmamos (BORRADOR -> FIRMADO).
    // La transmision a la DIAN (FIRMADO -> ENVIADO -> ACEPTADO) llega al
    // implementar el consumo SOAP en habilitacion.
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
          `No se pudo firmar con el certificado de la empresa: ${e.message}`,
        );
      }
    }

    // Persistimos y avanzamos el consecutivo de forma atomica.
    try {
      const [doc] = await this.prisma.$transaction([
        this.prisma.fiscalDocument.create({
          data: {
            companyId: company.id,
            type: docType,
            status, // BORRADOR sin cert; FIRMADO con cert. ENVIADO/ACEPTADO en Fase 2 (SOAP)
            prefix: resolution.prefix,
            number,
            fullNumber,
            cufe,
            input: dto as unknown as object,
            xmlSigned: finalXml,
            idempotencyKey: dto.idempotencyKey,
          },
        }),
        this.prisma.numberingResolution.update({
          where: { id: resolution.id },
          data: { current: { increment: 1 } },
        }),
      ]);
      return this.present(doc);
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw new ConflictException('Documento duplicado (idempotencia o consecutivo).');
      throw e;
    }
  }

  async get(platformId: string, id: string) {
    const doc = await this.prisma.fiscalDocument.findFirst({
      where: { id, company: { platformId } },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado.');
    return this.present(doc);
  }

  /** Elimina un documento SOLO si aún no fue transmitido a la DIAN. */
  async remove(platformId: string, id: string) {
    const doc = await this.prisma.fiscalDocument.findFirst({
      where: { id, company: { platformId } },
      select: { id: true, status: true },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado.');
    if (doc.status === 'ENVIADO' || doc.status === 'ACEPTADO') {
      throw new ConflictException(
        'No se puede eliminar una factura ya transmitida a la DIAN. Anúlala con una nota crédito.',
      );
    }
    await this.prisma.fiscalDocument.delete({ where: { id } });
    return { success: true };
  }

  /** HTML imprimible (representacion grafica con QR) del documento. */
  async representationHtml(platformId: string, id: string): Promise<string> {
    const doc = await this.prisma.fiscalDocument.findFirst({
      where: { id, company: { platformId } },
      include: { company: true },
    });
    if (!doc || !doc.cufe) throw new NotFoundException('Documento no encontrado.');
    const input = (doc.input as any) || {};
    const lines = (input.lines || []).map((l: any) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    }));
    const total = lines.reduce(
      (s: number, l: any) => s + l.quantity * l.unitPrice,
      0,
    );
    const labels: Record<string, string> = {
      FACTURA_VENTA: 'Factura electrónica',
      NOTA_CREDITO: 'Nota crédito',
      NOTA_DEBITO: 'Nota débito',
      DOCUMENTO_POS: 'Documento POS',
    };
    return this.representation.buildHtml({
      companyName: doc.company.legalName,
      nit: doc.company.nit,
      docTypeLabel: labels[doc.type] || doc.type,
      fullNumber: doc.fullNumber || '',
      cufe: doc.cufe,
      issueDate: doc.createdAt.toISOString().slice(0, 10),
      env: doc.company.env,
      customerName: input.customer?.name,
      lines,
      total,
    });
  }

  /** Suma lineas y calcula IVA por tarifa. */
  private computeTotals(lines: InvoiceLineDto[]) {
    let lineExtension = 0;
    let vat = 0;
    for (const l of lines) {
      const lineTotal = l.quantity * l.unitPrice;
      lineExtension += lineTotal;
      vat += lineTotal * ((l.vatRate ?? 0) / 100);
    }
    lineExtension = round2(lineExtension);
    vat = round2(vat);
    return {
      lineExtension,
      taxExclusive: lineExtension,
      taxInclusive: round2(lineExtension + vat),
      vat,
      payable: round2(lineExtension + vat),
    };
  }

  private present(doc: any) {
    const cust = (doc.input as any)?.customer || {};
    return {
      id: doc.id,
      type: doc.type,
      status: doc.status,
      number: doc.fullNumber,
      cufe: doc.cufe,
      xml: doc.xmlSigned,
      createdAt: doc.createdAt,
      customerName: cust.name || null,
      customerEmail: cust.email || null,
      customerPhone: cust.phone || null,
    };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
