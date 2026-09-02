import { Injectable } from '@nestjs/common';
import { SignedXml } from 'xml-crypto';
import { loadPkcs12, LoadedCert } from './pkcs12.util';

export interface CertMaterial {
  p12: Buffer; // certificado .p12 ya descifrado en memoria
  password: string; // clave del .p12 ya descifrada
}

/**
 * Firma de documentos UBL 2.1 para la DIAN.
 *
 * La DIAN exige una firma XML enveloped (dentro de ext:UBLExtensions/
 * ext:ExtensionContent), con canonicalizacion exclusiva (exc-c14n), digest
 * SHA-256 y algoritmo RSA-SHA256, bajo la politica XAdES-EPES.
 *
 * ESTADO: nucleo criptografico REAL y verificable —
 *   - carga del .p12 (clave privada + certificado),
 *   - firma enveloped RSA-SHA256 + exc-c14n insertada en ExtensionContent,
 *   - KeyInfo con X509Certificate.
 *   La firma resultante valida criptograficamente (probado con cert autofirmado).
 *
 * PENDIENTE de cerrar en habilitacion (contra el validador DIAN):
 *   - Propiedades XAdES-EPES: QualifyingProperties/SignedProperties con
 *     SigningTime, SigningCertificate (CertDigest+IssuerSerial) y
 *     SignaturePolicyIdentifier (OID + hash de la politica publicada por la DIAN).
 *   Se sella iterando contra el validador; base recomendada: lopezsoft/ubl21dian.
 */
@Injectable()
export class SigningService {
  /** Abre y valida el certificado; util para el flujo de carga. */
  loadCert(cert: CertMaterial): LoadedCert {
    return loadPkcs12(cert.p12, cert.password);
  }

  /** Firma el XML UBL (enveloped) e inserta ds:Signature en ExtensionContent. */
  signInvoiceXml(xml: string, cert: CertMaterial): string {
    const loaded = loadPkcs12(cert.p12, cert.password);

    const sig = new SignedXml({
      privateKey: loaded.privateKeyPem,
      publicCert: loaded.certificatePem,
      signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    });

    // Referencia enveloped sobre la raiz del documento (factura o nota).
    sig.addReference({
      xpath:
        "/*[local-name(.)='Invoice' or local-name(.)='CreditNote' or local-name(.)='DebitNote']",
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/2001/10/xml-exc-c14n#',
      ],
    });

    // KeyInfo con el certificado X509 (lo espera la DIAN).
    sig.getKeyInfoContent = () =>
      `<X509Data><X509Certificate>${loaded.certDerBase64}</X509Certificate></X509Data>`;

    // La firma va DENTRO de ext:UBLExtensions/ext:ExtensionContent.
    sig.computeSignature(xml, {
      location: {
        reference: "//*[local-name(.)='ExtensionContent']",
        action: 'append',
      },
    });

    return sig.getSignedXml();
  }

  /**
   * Firma del sobre SOAP (WS-Security) para transmitir al web service DIAN.
   * Se implementa junto con DianService en la fase de habilitacion.
   */
  async signSoapEnvelope(_soapXml: string, _cert: CertMaterial): Promise<string> {
    throw new Error(
      'SigningService.signSoapEnvelope: pendiente (Fase 2 / habilitacion, junto con DianService).',
    );
  }
}
