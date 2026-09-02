import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { CryptoService } from '@/common/crypto.service';
import { UblService } from '@/ubl/ubl.service';
import { SigningService } from '@/signing/signing.service';
import { InvoiceLineDto } from '@/invoices/dto/create-invoice.dto';
import { CreateNoteDto } from './dto/create-note.dto';

@Injectable()
export class NotesService {
  constructor(
    private prisma: PrismaService,
    private ubl: UblService,
    private signing: SigningService,
    private crypto: CryptoService,
  ) {}

  async create(
    platformId: string,
    dto: CreateNoteDto,
    kind: 'CREDIT' | 'DEBIT',
  ) {
    const company = await this.prisma.company.findFirst({
      where: { id: dto.companyId, platformId },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada.');
    if (!dto.lines?.length)
      throw new BadRequestException('La nota no tiene lineas.');

    const original = await this.prisma.fiscalDocument.findFirst({
      where: {
        id: dto.originalInvoiceId,
        companyId: company.id,
        type: DocumentType.FACTURA_VENTA,
      },
    });
    if (!original || !original.cufe || !original.fullNumber)
      throw new NotFoundException('Factura original no encontrada.');

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

    const docType =
      kind === 'CREDIT'
        ? DocumentType.NOTA_CREDITO
        : DocumentType.NOTA_DEBITO;

    const resolution = await this.prisma.numberingResolution.findFirst({
      where: { companyId: company.id, documentType: docType, active: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!resolution)
      throw new BadRequestException(
        `La empresa no tiene resolucion de numeracion para ${docType}.`,
      );

    const totals = this.computeTotals(dto.lines);
    const number = resolution.current;
    const fullNumber = `${resolution.prefix}${number}`;
    const now = new Date();
    const issueDate = now.toISOString().slice(0, 10);
    const issueTime = now.toTimeString().slice(0, 8) + '-05:00';
    const ambiente = company.env === 'PRODUCCION' ? 1 : 2;

    const { xml, cude } = this.ubl.buildNote(
      {
        ambiente,
        nitOFE: company.nit,
        pin: company.softwarePin || '',
        supplierName: company.legalName,
        customerName: '',
        customerId: '',
        fullNumber,
        issueDate,
        issueTime,
        originalNumber: original.fullNumber,
        originalCufe: original.cufe,
        originalDate: original.createdAt.toISOString().slice(0, 10),
        reason: dto.reason,
        reasonCode: dto.reasonCode,
        lines: dto.lines.map((l) => ({
          description: l.description,
          code: l.code,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          vatRate: l.vatRate ?? 0,
        })),
        totals,
      },
      kind,
    );

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
          `No se pudo firmar la nota: ${e.message}`,
        );
      }
    }

    const [doc] = await this.prisma.$transaction([
      this.prisma.fiscalDocument.create({
        data: {
          companyId: company.id,
          type: docType,
          status,
          prefix: resolution.prefix,
          number,
          fullNumber,
          cufe: cude,
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
  }

  private computeTotals(lines: InvoiceLineDto[]) {
    let lineExtension = 0;
    let vat = 0;
    for (const l of lines) {
      const t = l.quantity * l.unitPrice;
      lineExtension += t;
      vat += t * ((l.vatRate ?? 0) / 100);
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
    return {
      id: doc.id,
      type: doc.type,
      status: doc.status,
      number: doc.fullNumber,
      cude: doc.cufe,
      xml: doc.xmlSigned,
      createdAt: doc.createdAt,
    };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
