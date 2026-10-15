import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { MailerService } from '@/common/mailer.service';

// Control de cupo por PAQUETES. Cada plataforma tiene un paquete de N documentos
// (includedDocs) por periodo. Al consumirlos se BLOQUEA la emisión con 402
// QUOTA_EXCEEDED hasta que renueve (mensual/anual) o recargue (prepago). Avisa
// por correo al 80% y al 100%. NO hay cobro por documento adicional.
//   - MENSUAL: el cupo cuenta por mes calendario (se renueva solo).
//   - ANUAL:   el cupo cuenta por año calendario.
//   - BOLSA:   prepago, cuenta todo el histórico hasta que se recargue.
@Injectable()
export class QuotaService {
  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
  ) {}

  // Inicio del periodo del paquete (null = BOLSA prepago, cuenta todo).
  private periodStart(period: string): Date | null {
    const now = new Date();
    if (period === 'ANUAL') return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    if (period === 'BOLSA') return null;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private async notify(
    p: { name: string; planName: string | null; contactEmail: string | null },
    used: number,
    included: number,
    pct: 80 | 100,
  ) {
    if (!p.contactEmail) return;
    const plan = p.planName || 'tu bolsa de documentos';
    const subject =
      pct === 100
        ? `⚠️ ${plan}: bolsa de documentos agotada`
        : `Aviso: vas por el 80% de ${plan}`;
    const body =
      pct === 100
        ? `Tu bolsa de documentos (${plan}) se agotó: usaste ${used} de ${included}. Para seguir emitiendo facturas/nómina electrónica, recarga tu plan.`
        : `Has consumido el 80% de ${plan}: ${used} de ${included} documentos. Te recomendamos recargar pronto para no interrumpir tu facturación.`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
      <p>Hola ${p.name},</p>
      <p>${body}</p>
      <p style="color:#666;font-size:12px">Facturación y nómina electrónica · Pegazo</p>
    </div>`;
    await this.mailer.send(p.contactEmail, subject, html);
  }

  async assert(platformId: string): Promise<void> {
    const p = await this.prisma.platform.findUnique({
      where: { id: platformId },
      select: {
        period: true,
        includedDocs: true,
        name: true,
        planName: true,
        contactEmail: true,
        warned80: true,
        warned100: true,
      },
    });
    // Sin paquete configurado (includedDocs = 0) = sin límite.
    if (!p || !p.includedDocs) return;

    const start = this.periodStart(p.period);
    const used = await this.prisma.fiscalDocument.count({
      where: {
        company: { platformId },
        status: { not: 'BORRADOR' as any },
        ...(start ? { createdAt: { gte: start } } : {}),
      },
    });

    // Paquete consumido: bloquea (y avisa una vez).
    if (used >= p.includedDocs) {
      if (!p.warned100) {
        await this.notify(p, used, p.includedDocs, 100);
        await this.prisma.platform.update({
          where: { id: platformId },
          data: { warned100: true },
        });
      }
      throw new HttpException(
        {
          error: 'QUOTA_EXCEEDED',
          message:
            'Bolsa de documentos agotada. Recarga tu plan para seguir emitiendo.',
        },
        402,
      );
    }

    // Avisos proactivos sobre el documento que se va a emitir ahora.
    const after = used + 1;
    const t80 = Math.ceil(p.includedDocs * 0.8);
    const data: any = {};
    // Nuevo periodo (mensual/anual): el consumo bajó → se reinician los avisos
    // para volver a notificar en este ciclo.
    if (after < t80 && (p.warned80 || p.warned100)) {
      data.warned80 = false;
      data.warned100 = false;
      p.warned80 = false;
      p.warned100 = false;
    }
    if (after >= t80 && !p.warned80) {
      await this.notify(p, after, p.includedDocs, 80);
      data.warned80 = true;
    }
    if (after >= p.includedDocs && !p.warned100) {
      await this.notify(p, after, p.includedDocs, 100);
      data.warned100 = true;
    }
    if (Object.keys(data).length) {
      await this.prisma.platform.update({
        where: { id: platformId },
        data,
      });
    }
  }
}
