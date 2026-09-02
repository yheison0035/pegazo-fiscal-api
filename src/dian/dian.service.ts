import { Injectable } from '@nestjs/common';
import { DianEnv } from '@prisma/client';

export interface DianSendResult {
  accepted: boolean;
  statusCode?: string;
  statusDescription?: string;
  raw: unknown; // ApplicationResponse crudo
  trackId?: string;
}

/**
 * Cliente de los web services de validacion previa de la DIAN.
 *
 *   Habilitacion: https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc
 *   Produccion:   https://vpfe.dian.gov.co/WcfDianCustomerServices.svc
 *
 * Metodos DIAN:
 *   - SendTestSetAsync : envio del SET DE PRUEBAS (habilitacion).
 *   - SendBillSync     : envio sincronico en produccion (recomendado).
 *   - GetStatus        : consulta de estado por trackId.
 *   - SendEventUpdateStatus : eventos RADIAN (acuse, aceptacion...).
 *
 * ESTADO: interfaz + resolucion de endpoint por ambiente lista. El consumo SOAP
 * real (envelope + WS-Security + AttachedDocument en base64) se implementa junto
 * con SigningService en la fase de habilitacion.
 */
@Injectable()
export class DianService {
  endpointFor(env: DianEnv): string {
    return env === 'PRODUCCION'
      ? process.env.DIAN_WS_PRODUCCION ||
          'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc'
      : process.env.DIAN_WS_HABILITACION ||
          'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc';
  }

  /** Envia un documento firmado (produccion, sincronico). */
  async sendBillSync(
    _env: DianEnv,
    _signedXml: string,
    _fileName: string,
  ): Promise<DianSendResult> {
    throw new Error(
      'DianService.sendBillSync: pendiente de implementar el consumo SOAP (Fase 2 / habilitacion).',
    );
  }

  /** Envia documentos del set de pruebas (habilitacion). */
  async sendTestSetAsync(
    _signedXml: string,
    _fileName: string,
    _testSetId: string,
  ): Promise<DianSendResult> {
    throw new Error(
      'DianService.sendTestSetAsync: pendiente de implementar el consumo SOAP (Fase 2 / habilitacion).',
    );
  }
}
