import { Injectable } from '@nestjs/common';
import { DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';

/** Listado y estadisticas de documentos para los tableros de las plataformas. */
@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  async list(
    platformId: string,
    q: {
      companyId?: string;
      type?: string;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));

    const where: Prisma.FiscalDocumentWhereInput = {
      company: { platformId, ...(q.companyId ? { id: q.companyId } : {}) },
      ...(q.type && DocumentType[q.type as DocumentType]
        ? { type: q.type as DocumentType }
        : {}),
      ...(q.status && DocumentStatus[q.status as DocumentStatus]
        ? { status: q.status as DocumentStatus }
        : {}),
      ...(q.search
        ? {
            OR: [
              { fullNumber: { contains: q.search, mode: 'insensitive' } },
              { cufe: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.fiscalDocument.count({ where }),
      this.prisma.fiscalDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          status: true,
          fullNumber: true,
          cufe: true,
          createdAt: true,
          acceptedAt: true,
          errorMessage: true,
          company: { select: { legalName: true, nit: true } },
          input: true,
        },
      }),
    ]);

    const data = rows.map((r) => {
      const input = (r.input as any) || {};
      const total = (input.lines || []).reduce(
        (s: number, l: any) => s + (l.quantity || 0) * (l.unitPrice || 0),
        0,
      );
      return {
        id: r.id,
        type: r.type,
        status: r.status,
        number: r.fullNumber,
        cufe: r.cufe,
        customer: input.customer?.name || null,
        total,
        createdAt: r.createdAt,
        acceptedAt: r.acceptedAt,
        error: r.errorMessage,
        company: r.company,
      };
    });

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  /** Conteos por estado (para los KPIs del tablero). */
  async stats(platformId: string, companyId?: string) {
    const where: Prisma.FiscalDocumentWhereInput = {
      company: { platformId, ...(companyId ? { id: companyId } : {}) },
    };
    const grouped = await this.prisma.fiscalDocument.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const g of grouped) {
      byStatus[g.status] = g._count._all;
      total += g._count._all;
    }
    return {
      total,
      borrador: byStatus['BORRADOR'] || 0,
      firmado: byStatus['FIRMADO'] || 0,
      enviado: byStatus['ENVIADO'] || 0,
      aceptado: byStatus['ACEPTADO'] || 0,
      rechazado: byStatus['RECHAZADO'] || 0,
      contingencia: byStatus['CONTINGENCIA'] || 0,
    };
  }
}
