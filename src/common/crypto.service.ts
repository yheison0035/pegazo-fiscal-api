import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

/**
 * Cifrado de secretos en reposo (certificados .p12 de los clientes y sus claves).
 *
 * Usa AES-256-GCM con una clave maestra dada por CERT_ENCRYPTION_KEY (64 hex = 32 bytes).
 * El formato almacenado es: [iv(12) | authTag(16) | ciphertext]. Nada de esto sale por la API.
 */
@Injectable()
export class CryptoService {
  private cachedKey: Buffer | null = null;

  /** La clave maestra se valida al primer uso, no al arrancar el servicio. */
  private get key(): Buffer {
    if (this.cachedKey) return this.cachedKey;
    const hex = process.env.CERT_ENCRYPTION_KEY || '';
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new InternalServerErrorException(
        'CERT_ENCRYPTION_KEY debe ser 64 caracteres hex (32 bytes). Genera con: openssl rand -hex 32',
      );
    }
    this.cachedKey = Buffer.from(hex, 'hex');
    return this.cachedKey;
  }

  encrypt(data: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]);
  }

  decrypt(blob: Buffer): Buffer {
    const iv = blob.subarray(0, 12);
    const authTag = blob.subarray(12, 28);
    const ciphertext = blob.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  encryptString(text: string): Buffer {
    return this.encrypt(Buffer.from(text, 'utf8'));
  }

  decryptString(blob: Buffer): string {
    return this.decrypt(blob).toString('utf8');
  }

  /** Hash SHA-256 en hex (para API keys y comparaciones). */
  sha256(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
}
