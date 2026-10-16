import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { CryptoService } from '@/common/crypto.service';
import { ApiKeyService } from '@/auth/api-key.service';

/**
 * Endpoints de administracion protegidos por BOOTSTRAP_SECRET (header
 * x-bootstrap-secret). Gestionan las PLATAFORMAS consumidoras (cada cliente que
 * consume la API) y sus API keys. Si BOOTSTRAP_SECRET no esta definido, se bloquea.
 */
@Controller('admin')
export class AdminController {
  constructor(
    private prisma: PrismaService,
    private apiKeys: ApiKeyService,
    private crypto: CryptoService,
  ) {}

  // ─────────── Configuración del Proveedor Tecnológico (Pegazo) ───────────

  /** Datos NO secretos del PT (para el panel). */
  @Get('pt-config')
  async getPtConfig(@Headers('x-bootstrap-secret') secret: string) {
    this.assert(secret);
    const pt = await this.prisma.ptConfig.findUnique({ where: { id: 'pt' } });
    return {
      nit: pt?.nit || null,
      dv: pt?.dv || null,
      legalName: pt?.legalName || null,
      softwareId: pt?.softwareId || null,
      testSetId: pt?.testSetId || null,
      env: pt?.env || 'HABILITACION',
      hasCertificate: !!pt?.certEncrypted,
      hasSoftwarePin: !!pt?.softwarePin,
      certExpiresAt: pt?.certExpiresAt || null,
    };
  }

  /** Guarda los datos del PT (NIT, software, PIN, TestSetId, entorno). */
  @Patch('pt-config')
  async setPtConfig(
    @Headers('x-bootstrap-secret') secret: string,
    @Body()
    dto: {
      nit?: string;
      dv?: string;
      legalName?: string;
      softwareId?: string;
      softwarePin?: string;
      testSetId?: string;
      env?: string;
    },
  ) {
    this.assert(secret);
    const env = dto.env === 'PRODUCCION' ? 'PRODUCCION' : 'HABILITACION';
    const data: any = { env };
    for (const k of [
      'nit',
      'dv',
      'legalName',
      'softwareId',
      'softwarePin',
      'testSetId',
    ]) {
      if (dto[k] !== undefined) data[k] = String(dto[k] || '').trim() || null;
    }
    await this.prisma.ptConfig.upsert({
      where: { id: 'pt' },
      create: { id: 'pt', ...data },
      update: data,
    });
    return this.getPtConfig(secret);
  }

  /** Sube el certificado .p12 del PT (cifrado en reposo). */
  @Post('pt-config/certificate')
  async setPtCertificate(
    @Headers('x-bootstrap-secret') secret: string,
    @Body() dto: { p12Base64?: string; password?: string; expiresAt?: string },
  ) {
    this.assert(secret);
    if (!dto?.p12Base64 || !dto?.password)
      throw new UnauthorizedException('Falta el .p12 o la clave.');
    const p12 = Buffer.from(dto.p12Base64, 'base64');
    if (p12.length === 0)
      throw new UnauthorizedException('El .p12 está vacío.');
    const certData = {
      certEncrypted: Uint8Array.from(this.crypto.encrypt(p12)),
      certPassEnc: Uint8Array.from(this.crypto.encryptString(dto.password)),
      certExpiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    };
    await this.prisma.ptConfig.upsert({
      where: { id: 'pt' },
      create: { id: 'pt', ...certData },
      update: certData,
    });
    return { success: true, message: 'Certificado del PT guardado y cifrado.' };
  }

  private assert(secret?: string) {
    const expected = process.env.BOOTSTRAP_SECRET;
    if (!expected || secret !== expected)
      throw new UnauthorizedException('Bootstrap secret invalido.');
  }

  // Inicio del periodo de cobro según el plan. BOLSA = prepago (todo el histórico).
  private periodStart(period: string): Date | null {
    const now = new Date();
    if (period === 'ANUAL') return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    if (period === 'BOLSA') return null; // sin reinicio: cuenta todo
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); // MENSUAL
  }

  /** Lista las plataformas consumidoras con su plan, consumo y costo. */
  @Get('platforms')
  async listPlatforms(@Headers('x-bootstrap-secret') secret: string) {
    this.assert(secret);
    const platforms = await this.prisma.platform.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { apiKeys: true, companies: true } },
      },
    });
    return Promise.all(
      platforms.map(async (p) => {
        const start = this.periodStart(p.period);
        // Documentos EMITIDOS (no borradores) en el periodo = consumo facturable.
        const used = await this.prisma.fiscalDocument.count({
          where: {
            company: { platformId: p.id },
            status: { not: 'BORRADOR' as any },
            ...(start ? { createdAt: { gte: start } } : {}),
          },
        });
        // Cobro por PAQUETE: precio fijo por periodo (sin cobro por adicional).
        const remaining = Math.max(0, p.includedDocs - used);
        return {
          id: p.id,
          name: p.name,
          active: p.active,
          createdAt: p.createdAt,
          apiKeys: p._count.apiKeys,
          companies: p._count.companies,
          planName: p.planName,
          period: p.period,
          includedDocs: p.includedDocs,
          price: p.price,
          contactEmail: p.contactEmail,
          contactPhone: p.contactPhone,
          used,
          remaining,
          cost: p.price,
        };
      }),
    );
  }

  /** Edita el plan de cobro de una plataforma (precio editable). */
  @Patch('platforms/:id/plan')
  async setPlan(
    @Headers('x-bootstrap-secret') secret: string,
    @Param('id') id: string,
    @Body()
    dto: {
      planName?: string;
      period?: string;
      includedDocs?: number;
      price?: number;
      contactEmail?: string;
      contactPhone?: string;
    },
  ) {
    this.assert(secret);
    const period = ['MENSUAL', 'ANUAL', 'BOLSA'].includes(dto.period || '')
      ? dto.period
      : 'MENSUAL';
    return this.prisma.platform.update({
      where: { id },
      data: {
        planName: dto.planName?.trim() || null,
        period,
        includedDocs: Math.max(0, Number(dto.includedDocs) || 0),
        price: Math.max(0, Number(dto.price) || 0),
        overagePrice: 0, // modelo por paquetes: sin cobro por documento adicional
        contactEmail: dto.contactEmail?.trim() || null,
        contactPhone: dto.contactPhone?.trim() || null,
        // Editar el paquete = nuevo ciclo/recarga → se reinician los avisos.
        warned80: false,
        warned100: false,
      },
      select: {
        id: true,
        planName: true,
        period: true,
        includedDocs: true,
        price: true,
        contactEmail: true,
        contactPhone: true,
      },
    });
  }

  /** Crea una plataforma y devuelve su primera API key (una sola vez). */
  @Post('platforms')
  async createPlatform(
    @Headers('x-bootstrap-secret') secret: string,
    @Body() dto: { name?: string },
  ) {
    this.assert(secret);
    const platform = await this.prisma.platform.create({
      data: { name: dto?.name || 'Plataforma' },
    });
    const { apiKey } = await this.apiKeys.issue(platform.id, 'default', true);
    return { platformId: platform.id, name: platform.name, apiKey };
  }

  /** Activa / desactiva una plataforma (bloquea TODAS sus keys de una vez). */
  @Patch('platforms/:id')
  async togglePlatform(
    @Headers('x-bootstrap-secret') secret: string,
    @Param('id') id: string,
    @Body() dto: { active?: boolean },
  ) {
    this.assert(secret);
    const platform = await this.prisma.platform.update({
      where: { id },
      data: { active: dto?.active !== false },
      select: { id: true, name: true, active: true },
    });
    return platform;
  }

  /** Lista las API keys de una plataforma (sin exponer el secreto). */
  @Get('platforms/:id/api-keys')
  async listKeys(
    @Headers('x-bootstrap-secret') secret: string,
    @Param('id') id: string,
  ) {
    this.assert(secret);
    return this.prisma.apiKey.findMany({
      where: { platformId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        prefix: true,
        active: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
  }

  /** Emite una API key adicional para una plataforma existente. */
  @Post('api-keys')
  async createApiKey(
    @Headers('x-bootstrap-secret') secret: string,
    @Body() dto: { platformId: string; label?: string },
  ) {
    this.assert(secret);
    const { apiKey } = await this.apiKeys.issue(
      dto.platformId,
      dto.label || 'default',
      true,
    );
    return { platformId: dto.platformId, apiKey };
  }

  /** Revoca (desactiva) una API key. */
  @Patch('api-keys/:id/revoke')
  async revokeKey(
    @Headers('x-bootstrap-secret') secret: string,
    @Param('id') id: string,
  ) {
    this.assert(secret);
    await this.prisma.apiKey.update({
      where: { id },
      data: { active: false },
    });
    return { success: true };
  }
}
