import { Injectable } from '@nestjs/common';

export interface CertMaterial {
  p12: Buffer; // certificado .p12 ya descifrado en memoria
  password: string; // clave del .p12 ya descifrada
}

/**
 * Firma XAdES-EPES de documentos UBL 2.1 para la DIAN.
 *
 * La DIAN exige politica de firma XAdES-EPES sobre el XML (firma enveloped dentro
 * de ext:UBLExtensions/ext:ExtensionContent) y, ademas, firma WS-Security sobre el
 * sobre SOAP que viaja al web service.
 *
 * ESTADO: interfaz definida. La implementacion criptografica se completa con un
 * certificado real en el ambiente de habilitacion, porque:
 *   - Requiere extraer clave privada + cadena del .p12 (node-forge / pkcs12).
 *   - El SignedInfo y las Reference/Transforms deben cumplir el perfil exacto DIAN
 *     (canonicalizacion exc-c14n, digest SHA-256, SignaturePolicyIdentifier con el
 *     OID y hash de la politica de firma publicada por la DIAN).
 *   - Se valida iterativamente contra el validador de la DIAN hasta 0 errores.
 *
 * Referencia: existen implementaciones open source de XAdES-EPES para UBL DIAN que
 * sirven de base (p.ej. lopezsoft/ubl21dian). No reinventar el perfil de firma.
 */
@Injectable()
export class SigningService {
  /** Firma el XML UBL con XAdES-EPES y devuelve el XML firmado. */
  async signInvoiceXml(_xml: string, _cert: CertMaterial): Promise<string> {
    throw new Error(
      'SigningService.signInvoiceXml: pendiente de implementar con certificado real (Fase 2 / habilitacion).',
    );
  }

  /** Firma el sobre SOAP (WS-Security) para transmitir al web service DIAN. */
  async signSoapEnvelope(_soapXml: string, _cert: CertMaterial): Promise<string> {
    throw new Error(
      'SigningService.signSoapEnvelope: pendiente de implementar con certificado real (Fase 2 / habilitacion).',
    );
  }
}
