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
  ) {}

  private assert(secret?: string) {
    const expected = process.env.BOOTSTRAP_SECRET;
    if (!expected || secret !== expected)
      throw new UnauthorizedException('Bootstrap secret invalido.');
  }

  /** Lista las plataformas consumidoras con sus conteos. */
  @Get('platforms')
  async listPlatforms(@Headers('x-bootstrap-secret') secret: string) {
    this.assert(secret);
    const platforms = await this.prisma.platform.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { apiKeys: true, companies: true } },
      },
    });
    return platforms.map((p) => ({
      id: p.id,
      name: p.name,
      active: p.active,
      createdAt: p.createdAt,
      apiKeys: p._count.apiKeys,
      companies: p._count.companies,
    }));
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
