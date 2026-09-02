import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyService } from './api-key.service';

/**
 * Protege las rutas exigiendo una API key valida.
 * Acepta:  Authorization: Bearer pgz_...   o   X-Api-Key: pgz_...
 * Al pasar, deja req.platformId disponible para el resto de la peticion.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private apiKeys: ApiKeyService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    const fromBearer = header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : '';
    const key = fromBearer || (req.headers['x-api-key'] as string) || '';

    if (!key) throw new UnauthorizedException('Falta la API key.');

    const platformId = await this.apiKeys.verify(key);
    if (!platformId) throw new UnauthorizedException('API key invalida.');

    req.platformId = platformId;
    return true;
  }
}
