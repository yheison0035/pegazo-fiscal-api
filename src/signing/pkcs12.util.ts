import * as forge from 'node-forge';

export interface LoadedCert {
  privateKeyPem: string; // clave privada en PEM
  certificatePem: string; // certificado del firmante en PEM
  certDerBase64: string; // certificado en DER base64 (para X509Certificate del XML)
  issuerName: string; // nombre del emisor (para XAdES SigningCertificate)
  serialNumber: string; // serial del certificado (decimal)
  notAfter: Date; // vencimiento
}

/**
 * Abre un certificado .p12 / .pfx (PKCS#12) y extrae la clave privada y el
 * certificado del firmante en los formatos que necesita la firma XML.
 */
export function loadPkcs12(p12: Buffer, password: string): LoadedCert {
  const p12Der = forge.util.createBuffer(p12.toString('binary'));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12Store = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  // Clave privada
  const keyBags = p12Store.getBags({
    bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
  })[forge.pki.oids.pkcs8ShroudedKeyBag];
  const keyBag =
    (keyBags && keyBags[0]) ||
    (p12Store.getBags({ bagType: forge.pki.oids.keyBag })[
      forge.pki.oids.keyBag
    ] || [])[0];
  if (!keyBag || !keyBag.key)
    throw new Error('No se encontró la clave privada en el .p12.');

  // Certificado del firmante
  const certBags = p12Store.getBags({ bagType: forge.pki.oids.certBag })[
    forge.pki.oids.certBag
  ];
  if (!certBags || !certBags.length || !certBags[0].cert)
    throw new Error('No se encontró el certificado en el .p12.');
  const cert = certBags[0].cert;

  const certDer = forge.asn1
    .toDer(forge.pki.certificateToAsn1(cert))
    .getBytes();

  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certificatePem: forge.pki.certificateToPem(cert),
    certDerBase64: forge.util.encode64(certDer),
    issuerName: cert.issuer.attributes
      .map((a) => `${a.shortName}=${a.value}`)
      .join(','),
    serialNumber: cert.serialNumber
      ? BigInt('0x' + cert.serialNumber).toString(10)
      : '0',
    notAfter: cert.validity.notAfter,
  };
}
