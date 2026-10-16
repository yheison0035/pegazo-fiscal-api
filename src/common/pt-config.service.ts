import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CryptoService } from './crypto.service';

export interface EffectiveFiscalConfig {
  env: string;
  softwarePin: string;
  testSetId: string | null;
  cert: { p12: Buffer; password: string } | null;
  usingPt: boolean;
}

/**
 * Config del Proveedor Tecnológico (Pegazo), singleton id="pt". En modelo PT,
 * Pegazo firma por todos sus clientes con ESTE certificado/software, así ningún
 * cliente necesita el suyo. `effective()` usa lo de la empresa y, si no tiene,
 * cae al PT (compatible con el modelo "software propio" anterior).
 */
@Injectable()
export class PtConfigService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  async get() {
    return this.prisma.ptConfig
      .findUnique({ where: { id: 'pt' } })
      .catch(() => null);
  }

  /** Datos NO secretos del PT (para mostrar al cliente y en el estado). */
  async publicInfo() {
    const pt = await this.get();
    if (!pt) return null;
    return {
      nit: pt.nit,
      dv: pt.dv,
      legalName: pt.legalName,
      softwareId: pt.softwareId,
      env: pt.env,
      hasCertificate: !!pt.certEncrypted,
      certExpiresAt: pt.certExpiresAt,
    };
  }

  /** Config efectiva para emitir: empresa primero; si falta, cae al PT. */
  async effective(company: any): Promise<EffectiveFiscalConfig> {
    const pt = await this.get();
    const ownCert = !!(company.certEncrypted && company.certPassEnc);
    const usingPt = !ownCert && !!(pt?.certEncrypted && pt?.certPassEnc);

    const certEnc = ownCert ? company.certEncrypted : pt?.certEncrypted;
    const certPass = ownCert ? company.certPassEnc : pt?.certPassEnc;
    let cert: { p12: Buffer; password: string } | null = null;
    if (certEnc && certPass) {
      cert = {
        p12: this.crypto.decrypt(Buffer.from(certEnc)),
        password: this.crypto.decryptString(Buffer.from(certPass)),
      };
    }

    const env =
      company.env === 'PRODUCCION'
        ? 'PRODUCCION'
        : usingPt
          ? pt?.env || company.env
          : company.env;

    return {
      env,
      softwarePin: company.softwarePin || pt?.softwarePin || '',
      testSetId: company.testSetId || pt?.testSetId || null,
      cert,
      usingPt,
    };
  }
}
