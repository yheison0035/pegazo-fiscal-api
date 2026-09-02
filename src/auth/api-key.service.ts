import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '@/common/prisma.service';
import { CryptoService } from '@/common/crypto.service';

/**
 * Emision y verificacion de API keys por plataforma.
 *
 * Formato de la key:  pgz_<env>_<prefix8>_<secret32>
 *   - Se muestra COMPLETA una sola vez, al crearla.
 *   - En BD se guarda solo el prefijo visible (para buscar) y el hash del secreto.
 */
@Injectable()
export class ApiKeyService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  /** Crea una API key nueva y devuelve el valor en claro (unica vez). */
  async issue(platformId: string, label: string, live = true) {
    const env = live ? 'live' : 'test';
    const prefixRnd = randomBytes(4).toString('hex'); // 8 hex
    const secret = randomBytes(24).toString('hex'); // 48 hex
    const prefix = `pgz_${env}_${prefixRnd}`;
    const fullKey = `${prefix}_${secret}`;

    await this.prisma.apiKey.create({
      data: {
        platformId,
        label,
        prefix,
        hashedKey: this.crypto.sha256(secret),
      },
    });

    return { apiKey: fullKey, prefix };
  }

  /** Verifica una key entrante y devuelve el platformId, o null si es invalida. */
  async verify(fullKey: string): Promise<string | null> {
    // pgz_live_<prefix8>_<secret>
    const parts = fullKey.split('_');
    if (parts.length !== 4 || parts[0] !== 'pgz') return null;
    const prefix = `${parts[0]}_${parts[1]}_${parts[2]}`;
    const secret = parts[3];

    const record = await this.prisma.apiKey.findUnique({
      where: { prefix },
      include: { platform: true },
    });
    if (!record || !record.active || !record.platform.active) return null;
    if (this.crypto.sha256(secret) !== record.hashedKey) return null;

    // marca de uso (best-effort, no bloquea)
    this.prisma.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return record.platformId;
  }
}
