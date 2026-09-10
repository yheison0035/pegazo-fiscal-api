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
   * Firma del sobre SOAP con WS-Security (Timestamp + BinarySecurityToken +
   * ds:Signature sobre Timestamp/Body/To) para transmitir al web service DIAN.
   *
   * Reemplaza el marcador <!--SECURITY_PLACEHOLDER--> del encabezado por el
   * bloque wsse:Security firmado con el MISMO certificado del cliente.
   *
   * NOTA: la estructura sigue el perfil que exige la DIAN; el "visto bueno"
   * final se sella iterando contra el validador con el certificado real.
   */
  async signSoapEnvelope(soapXml: string, cert: CertMaterial): Promise<string> {
    const loaded = loadPkcs12(cert.p12, cert.password);
    const WSSE =
      'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
    const WSU =
      'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
    const now = new Date();
    const created = now.toISOString();
    const expires = new Date(now.getTime() + 60_000).toISOString();

    // Bloque de seguridad SIN firma todavia (Timestamp + token del certificado).
    const security =
      `<wsse:Security xmlns:wsse="${WSSE}" xmlns:wsu="${WSU}" s:mustUnderstand="1">` +
      `<wsu:Timestamp wsu:Id="TS">` +
      `<wsu:Created>${created}</wsu:Created>` +
      `<wsu:Expires>${expires}</wsu:Expires>` +
      `</wsu:Timestamp>` +
      `<wsse:BinarySecurityToken EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary" ` +
      `ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" wsu:Id="X509">` +
      `${loaded.certDerBase64}</wsse:BinarySecurityToken>` +
      `</wsse:Security>`;

    const envelope = soapXml.replace('<!--SECURITY_PLACEHOLDER-->', security);

    const sig = new SignedXml({
      privateKey: loaded.privateKeyPem,
      publicCert: loaded.certificatePem,
      signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    });

    // Se firman Timestamp, Body y To (referenciados por su wsu:Id).
    for (const id of ['TS', 'Body', 'To']) {
      sig.addReference({
        xpath: `//*[@*[local-name(.)='Id']='${id}']`,
        digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
        transforms: ['http://www.w3.org/2001/10/xml-exc-c14n#'],
      });
    }

    // KeyInfo -> SecurityTokenReference que apunta al BinarySecurityToken.
    sig.getKeyInfoContent = () =>
      `<wsse:SecurityTokenReference xmlns:wsse="${WSSE}">` +
      `<wsse:Reference URI="#X509" ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3"/>` +
      `</wsse:SecurityTokenReference>`;

    // La ds:Signature va DENTRO del bloque wsse:Security.
    sig.computeSignature(envelope, {
      location: {
        reference: "//*[local-name(.)='Security']",
        action: 'append',
      },
    });

    return sig.getSignedXml();
  }
}
