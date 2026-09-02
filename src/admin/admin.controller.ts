import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { ApiKeyService } from '@/auth/api-key.service';

/**
 * Endpoints de administracion protegidos por BOOTSTRAP_SECRET (header
 * x-bootstrap-secret). Sirven para crear la primera plataforma y sus API keys
 * sin depender de la consola. Si BOOTSTRAP_SECRET no esta definido, se bloquea.
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
}
