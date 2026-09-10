import { Injectable } from '@nestjs/common';
import { DianEnv } from '@prisma/client';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { SigningService, CertMaterial } from '@/signing/signing.service';

export interface DianSendResult {
  accepted: boolean;
  statusCode?: string;
  statusDescription?: string;
  errors?: string[];
  raw: string; // ApplicationResponse / respuesta cruda (base64 o XML)
  trackId?: string; // ZipKey / trackId para consultar estado
}

const NS_SOAP = 'http://www.w3.org/2003/05/soap-envelope';
const NS_WCF = 'http://wcf.dian.colombia';
const NS_WSA = 'http://www.w3.org/2005/08/addressing';

/**
 * Cliente de los web services de validacion previa de la DIAN
 * (WcfDianCustomerServices, SOAP 1.2 + WS-Addressing + WS-Security).
 *
 *   Habilitacion: https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc
 *   Produccion:   https://vpfe.dian.gov.co/WcfDianCustomerServices.svc
 *
 * Metodos:
 *   - SendBillSync      : envio sincronico (habilitacion y produccion).
 *   - SendTestSetAsync  : envio del SET DE PRUEBAS (asincrono) -> ZipKey.
 *   - GetStatus         : consulta de estado por trackId/ZipKey.
 *
 * IMPORTANTE (habilitacion): el sobre se firma con WS-Security usando el MISMO
 * certificado del cliente; la firma XAdES-EPES del documento va en el XML (ver
 * SigningService). El "visto bueno" final se obtiene iterando contra el
 * validador de la DIAN con el certificado real (esa parte es del cliente).
 */
@Injectable()
export class DianService {
  constructor(private readonly signing: SigningService) {}

  endpointFor(env: DianEnv): string {
    return env === 'PRODUCCION'
      ? process.env.DIAN_WS_PRODUCCION ||
          'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc'
      : process.env.DIAN_WS_HABILITACION ||
          'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc';
  }

  // Empaqueta el XML firmado en un ZIP y lo devuelve en base64 (lo que la DIAN
  // recibe en contentFile).
  private async zipBase64(signedXml: string, fileName: string): Promise<string> {
    const zip = new JSZip();
    zip.file(fileName, signedXml);
    const buf = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    return buf.toString('base64');
  }

  // Construye el sobre SOAP 1.2 con WS-Addressing y el cuerpo de la operacion.
  private buildEnvelope(
    action: string,
    endpoint: string,
    bodyInner: string,
  ): string {
    const msgId = `uuid:${cryptoRandom()}`;
    return (
      `<s:Envelope xmlns:s="${NS_SOAP}" xmlns:wcf="${NS_WCF}" xmlns:wsa="${NS_WSA}">` +
      `<s:Header>` +
      `<wsa:Action s:mustUnderstand="1">${action}</wsa:Action>` +
      `<wsa:To s:mustUnderstand="1" wsu:Id="To" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">${endpoint}</wsa:To>` +
      `<wsa:MessageID>${msgId}</wsa:MessageID>` +
      `<wsa:ReplyTo><wsa:Address>http://www.w3.org/2005/08/addressing/anonymous</wsa:Address></wsa:ReplyTo>` +
      // Placeholder del bloque WS-Security: SigningService lo reemplaza al firmar.
      `<!--SECURITY_PLACEHOLDER-->` +
      `</s:Header>` +
      `<s:Body wsu:Id="Body" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">` +
      bodyInner +
      `</s:Body>` +
      `</s:Envelope>`
    );
  }

  private async post(
    endpoint: string,
    action: string,
    envelopeSigned: string,
  ): Promise<string> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        // SOAP 1.2: la accion va dentro del Content-Type.
        'Content-Type': `application/soap+xml;charset=UTF-8;action="${action}"`,
      },
      body: envelopeSigned,
    });
    const text = await res.text();
    if (!res.ok && !text.includes('Envelope')) {
      throw new Error(`DIAN HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return text;
  }

  // Extrae el primer valor de un tag (por local-name) de un XML.
  private pick(xml: string, localName: string): string | undefined {
    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const nodes = doc.getElementsByTagName('*');
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes.item(i);
        if (n && n.localName === localName && n.textContent)
          return n.textContent.trim();
      }
    } catch {
      /* respuesta no-XML */
    }
    return undefined;
  }

  private pickAll(xml: string, localName: string): string[] {
    const out: string[] = [];
    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const nodes = doc.getElementsByTagName('*');
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes.item(i);
        if (n && n.localName === localName && n.textContent)
          out.push(n.textContent.trim());
      }
    } catch {
      /* ignore */
    }
    return out;
  }

  private parseResult(xml: string): DianSendResult {
    const isValid = (this.pick(xml, 'IsValid') || '').toLowerCase() === 'true';
    const statusCode = this.pick(xml, 'StatusCode');
    const statusDescription = this.pick(xml, 'StatusDescription');
    const errors = this.pickAll(xml, 'string');
    const app =
      this.pick(xml, 'XmlBase64Bytes') || this.pick(xml, 'XmlDocumentKey');
    const trackId = this.pick(xml, 'ZipKey') || this.pick(xml, 'TrackId');
    return {
      accepted: isValid || statusCode === '00',
      statusCode,
      statusDescription,
      errors: errors.length ? errors : undefined,
      raw: app || xml,
      trackId,
    };
  }

  /** Envio sincronico de un documento firmado (habilitacion o produccion). */
  async sendBillSync(
    env: DianEnv,
    signedXml: string,
    fileName: string,
    cert: CertMaterial,
  ): Promise<DianSendResult> {
    const endpoint = this.endpointFor(env);
    const action = `${NS_WCF}/IWcfDianCustomerServices/SendBillSync`;
    const contentFile = await this.zipBase64(signedXml, fileName);
    const zipName = fileName.replace(/\.xml$/i, '.zip');
    const body =
      `<wcf:SendBillSync>` +
      `<wcf:fileName>${zipName}</wcf:fileName>` +
      `<wcf:contentFile>${contentFile}</wcf:contentFile>` +
      `</wcf:SendBillSync>`;
    const envelope = this.buildEnvelope(action, endpoint, body);
    const signed = await this.signing.signSoapEnvelope(envelope, cert);
    const resp = await this.post(endpoint, action, signed);
    return this.parseResult(resp);
  }

  /** Envio del set de pruebas (habilitacion, asincrono). Devuelve ZipKey. */
  async sendTestSetAsync(
    signedXml: string,
    fileName: string,
    testSetId: string,
    cert: CertMaterial,
    nit: string,
  ): Promise<DianSendResult> {
    const endpoint = this.endpointFor('HABILITACION' as DianEnv);
    const action = `${NS_WCF}/IWcfDianCustomerServices/SendTestSetAsync`;
    const contentFile = await this.zipBase64(signedXml, fileName);
    const zipName = fileName.replace(/\.xml$/i, '.zip');
    const body =
      `<wcf:SendTestSetAsync>` +
      `<wcf:fileName>${zipName}</wcf:fileName>` +
      `<wcf:contentFile>${contentFile}</wcf:contentFile>` +
      `<wcf:testSetId>${testSetId}</wcf:testSetId>` +
      `</wcf:SendTestSetAsync>`;
    const envelope = this.buildEnvelope(action, endpoint, body);
    const signed = await this.signing.signSoapEnvelope(envelope, cert);
    const resp = await this.post(endpoint, action, signed);
    return this.parseResult(resp);
  }

  /** Consulta el estado de un envio por su trackId/ZipKey. */
  async getStatus(
    env: DianEnv,
    trackId: string,
    cert: CertMaterial,
  ): Promise<DianSendResult> {
    const endpoint = this.endpointFor(env);
    const action = `${NS_WCF}/IWcfDianCustomerServices/GetStatus`;
    const body =
      `<wcf:GetStatus><wcf:trackId>${trackId}</wcf:trackId></wcf:GetStatus>`;
    const envelope = this.buildEnvelope(action, endpoint, body);
    const signed = await this.signing.signSoapEnvelope(envelope, cert);
    const resp = await this.post(endpoint, action, signed);
    return this.parseResult(resp);
  }
}

// UUID v4 sencillo (para MessageID / Ids del sobre) sin dependencias extra.
function cryptoRandom(): string {
  const b = require('crypto').randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
