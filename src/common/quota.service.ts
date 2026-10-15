import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';

// Control de cupo por plataforma (cobro por consumo). Solo el plan BOLSA
// (prepago) bloquea al agotarse: cuando los documentos emitidos llegan a los
// incluidos, se rechaza la emisión con 402 QUOTA_EXCEEDED → la plataforma
// cliente recibe el aviso y debe recargar. Los planes MENSUAL/ANUAL son pospago
// (se cobra el adicional), así que no bloquean.
@Injectable()
export class QuotaService {
  constructor(private prisma: PrismaService) {}

  async assert(platformId: string): Promise<void> {
    const p = await this.prisma.platform.findUnique({
      where: { id: platformId },
      select: { period: true, includedDocs: true },
    });
    if (!p || p.period !== 'BOLSA' || !p.includedDocs) return;

    const used = await this.prisma.fiscalDocument.count({
      where: {
        company: { platformId },
        status: { not: 'BORRADOR' as any },
      },
    });
    if (used >= p.includedDocs) {
      throw new HttpException(
        {
          error: 'QUOTA_EXCEEDED',
          message:
            'Bolsa de documentos agotada. Recarga tu plan para seguir emitiendo.',
        },
        402,
      );
    }
  }
}
