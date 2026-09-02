import { Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import { calcCufe, AmbienteDian } from './cufe.util';

export interface UblLine {
  description: string;
  code?: string;
  quantity: number;
  unitPrice: number;
  vatRate: number; // %
}

export interface UblTotals {
  lineExtension: number; // subtotal sin impuestos
  taxExclusive: number; // base gravable
  taxInclusive: number; // con impuestos
  vat: number; // total IVA
  payable: number; // total a pagar
}

export interface UblInvoiceParams {
  ambiente: AmbienteDian;
  nitOFE: string;
  claveTecnica: string;
  supplierName: string;
  customerName: string;
  customerId: string;
  fullNumber: string;
  issueDate: string; // AAAA-MM-DD
  issueTime: string; // HH:MM:SS-05:00
  lines: UblLine[];
  totals: UblTotals;
  notes?: string;
}

/**
 * Generador de XML UBL 2.1 para la DIAN.
 *
 * Este servicio arma la estructura del documento y calcula el CUFE. La firma
 * XAdES-EPES la aplica SigningService sobre el XML que aqui se produce.
 *
 * ESTADO: estructura base funcional (Invoice + lineas + totales + CUFE).
 * PENDIENTE de completar contra el Anexo Tecnico v1.9 antes de ir a habilitacion:
 *   - Bloque UBLExtensions/DianExtensions (InvoiceControl, InvoiceSource,
 *     SoftwareProvider, SoftwareSecurityCode, AuthorizationProvider, QRCode).
 *   - Grupos de impuestos por linea (TaxTotal/TaxSubtotal con esquema 01 IVA).
 *   - PartyTaxScheme completo de emisor y adquiriente (responsabilidades fiscales).
 *   - PaymentMeans / PaymentTerms.
 * Todo esto se ajusta con el XSD oficial y se valida en el ambiente de habilitacion.
 */
@Injectable()
export class UblService {
  buildInvoice(p: UblInvoiceParams): { xml: string; cufe: string } {
    const cufe = calcCufe({
      numFac: p.fullNumber,
      fecFac: p.issueDate,
      horFac: p.issueTime,
      valFac: p.totals.lineExtension,
      valImpuesto1: p.totals.vat,
      valImpuesto2: 0,
      valImpuesto3: 0,
      valTot: p.totals.payable,
      nitOFE: p.nitOFE,
      numAdq: p.customerId,
      claveTecnica: p.claveTecnica,
      ambiente: p.ambiente,
    });

    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('Invoice', {
        xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
        'xmlns:cac':
          'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
        'xmlns:cbc':
          'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
        'xmlns:ext':
          'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      });

    // ext:UBLExtensions con un ExtensionContent vacio: es donde SigningService
    // inserta la firma. El bloque DianExtensions (InvoiceControl, SoftwareProvider,
    // QRCode) se agrega como una extension adicional en habilitacion.
    doc.ele('ext:UBLExtensions').ele('ext:UBLExtension').ele('ext:ExtensionContent').up().up().up();

    doc.ele('cbc:UBLVersionID').txt('UBL 2.1').up();
    doc.ele('cbc:CustomizationID').txt('10').up(); // 10 = factura de venta nacional
    doc.ele('cbc:ProfileID').txt('DIAN 2.1').up();
    doc
      .ele('cbc:ProfileExecutionID')
      .txt(String(p.ambiente))
      .up(); // 1 prod, 2 hab
    doc.ele('cbc:ID').txt(p.fullNumber).up();
    doc.ele('cbc:UUID', { schemeName: 'CUFE-SHA384' }).txt(cufe).up();
    doc.ele('cbc:IssueDate').txt(p.issueDate).up();
    doc.ele('cbc:IssueTime').txt(p.issueTime).up();
    doc.ele('cbc:InvoiceTypeCode').txt('01').up(); // 01 = factura de venta
    if (p.notes) doc.ele('cbc:Note').txt(p.notes).up();
    doc.ele('cbc:DocumentCurrencyCode').txt('COP').up();

    // Emisor (resumido — completar PartyTaxScheme/responsabilidades)
    const supplier = doc
      .ele('cac:AccountingSupplierParty')
      .ele('cac:Party');
    supplier
      .ele('cac:PartyName')
      .ele('cbc:Name')
      .txt(p.supplierName)
      .up()
      .up();
    supplier.up().up();

    // Adquiriente
    const customer = doc
      .ele('cac:AccountingCustomerParty')
      .ele('cac:Party');
    customer
      .ele('cac:PartyName')
      .ele('cbc:Name')
      .txt(p.customerName)
      .up()
      .up();
    customer.up().up();

    // Impuestos (resumen IVA 01)
    const taxTotal = doc.ele('cac:TaxTotal');
    taxTotal.ele('cbc:TaxAmount', { currencyID: 'COP' }).txt(p.totals.vat.toFixed(2)).up();
    taxTotal.up();

    // Totales monetarios
    const mon = doc.ele('cac:LegalMonetaryTotal');
    mon.ele('cbc:LineExtensionAmount', { currencyID: 'COP' }).txt(p.totals.lineExtension.toFixed(2)).up();
    mon.ele('cbc:TaxExclusiveAmount', { currencyID: 'COP' }).txt(p.totals.taxExclusive.toFixed(2)).up();
    mon.ele('cbc:TaxInclusiveAmount', { currencyID: 'COP' }).txt(p.totals.taxInclusive.toFixed(2)).up();
    mon.ele('cbc:PayableAmount', { currencyID: 'COP' }).txt(p.totals.payable.toFixed(2)).up();
    mon.up();

    // Lineas
    p.lines.forEach((l, i) => {
      const line = doc.ele('cac:InvoiceLine');
      line.ele('cbc:ID').txt(String(i + 1)).up();
      line.ele('cbc:InvoicedQuantity', { unitCode: 'NIU' }).txt(String(l.quantity)).up();
      line
        .ele('cbc:LineExtensionAmount', { currencyID: 'COP' })
        .txt((l.quantity * l.unitPrice).toFixed(2))
        .up();
      line
        .ele('cac:Item')
        .ele('cbc:Description')
        .txt(l.description)
        .up()
        .up();
      line
        .ele('cac:Price')
        .ele('cbc:PriceAmount', { currencyID: 'COP' })
        .txt(l.unitPrice.toFixed(2))
        .up()
        .up();
      line.up();
    });

    const xml = doc.end({ prettyPrint: false });
    return { xml, cufe };
  }

  /**
   * Nota credito o debito. Referencia la factura original (BillingReference con su
   * CUFE) e incluye el motivo (DiscrepancyResponse). El identificador unico es un
   * CUDE (usa el PIN del software en la posicion de la clave tecnica).
   */
  buildNote(
    p: UblNoteParams,
    kind: 'CREDIT' | 'DEBIT',
  ): { xml: string; cude: string } {
    const cude = calcCufe({
      numFac: p.fullNumber,
      fecFac: p.issueDate,
      horFac: p.issueTime,
      valFac: p.totals.lineExtension,
      valImpuesto1: p.totals.vat,
      valImpuesto2: 0,
      valImpuesto3: 0,
      valTot: p.totals.payable,
      nitOFE: p.nitOFE,
      numAdq: p.customerId,
      claveTecnica: p.pin, // CUDE: PIN en lugar de clave tecnica
      ambiente: p.ambiente,
    });

    const root = kind === 'CREDIT' ? 'CreditNote' : 'DebitNote';
    const rootNs =
      kind === 'CREDIT'
        ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2'
        : 'urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2';
    const typeCodeTag =
      kind === 'CREDIT' ? 'cbc:CreditNoteTypeCode' : 'cbc:DebitNoteTypeCode';
    const totalTag =
      kind === 'CREDIT' ? 'cac:LegalMonetaryTotal' : 'cac:RequestedMonetaryTotal';

    const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele(root, {
      xmlns: rootNs,
      'xmlns:cac':
        'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'xmlns:cbc':
        'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'xmlns:ext':
        'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    });

    doc.ele('ext:UBLExtensions').ele('ext:UBLExtension').ele('ext:ExtensionContent').up().up().up();
    doc.ele('cbc:UBLVersionID').txt('UBL 2.1').up();
    doc.ele('cbc:CustomizationID').txt(kind === 'CREDIT' ? '20' : '30').up();
    doc.ele('cbc:ProfileID').txt('DIAN 2.1').up();
    doc.ele('cbc:ProfileExecutionID').txt(String(p.ambiente)).up();
    doc.ele('cbc:ID').txt(p.fullNumber).up();
    doc.ele('cbc:UUID', { schemeName: 'CUDE-SHA384' }).txt(cude).up();
    doc.ele('cbc:IssueDate').txt(p.issueDate).up();
    doc.ele('cbc:IssueTime').txt(p.issueTime).up();
    doc.ele(typeCodeTag).txt('90').up(); // 90 nota credito, 92 nota debito (ajustar por anexo)
    if (p.reason) doc.ele('cbc:Note').txt(p.reason).up();
    doc.ele('cbc:DocumentCurrencyCode').txt('COP').up();

    // Motivo de la nota
    const disc = doc.ele('cac:DiscrepancyResponse');
    disc.ele('cbc:ReferenceID').txt(p.originalNumber).up();
    disc.ele('cbc:ResponseCode').txt(p.reasonCode || (kind === 'CREDIT' ? '2' : '1')).up();
    disc.ele('cbc:Description').txt(p.reason || '').up();
    disc.up();

    // Referencia a la factura original (con su CUFE)
    const bill = doc.ele('cac:BillingReference').ele('cac:InvoiceDocumentReference');
    bill.ele('cbc:ID').txt(p.originalNumber).up();
    bill.ele('cbc:UUID', { schemeName: 'CUFE-SHA384' }).txt(p.originalCufe).up();
    bill.ele('cbc:IssueDate').txt(p.originalDate).up();
    bill.up().up();

    // Emisor / adquiriente (resumen)
    doc.ele('cac:AccountingSupplierParty').ele('cac:Party').ele('cac:PartyName').ele('cbc:Name').txt(p.supplierName).up().up().up().up();
    doc.ele('cac:AccountingCustomerParty').ele('cac:Party').ele('cac:PartyName').ele('cbc:Name').txt(p.customerName).up().up().up().up();

    // Impuestos + totales
    doc.ele('cac:TaxTotal').ele('cbc:TaxAmount', { currencyID: 'COP' }).txt(p.totals.vat.toFixed(2)).up().up();
    const mon = doc.ele(totalTag);
    mon.ele('cbc:LineExtensionAmount', { currencyID: 'COP' }).txt(p.totals.lineExtension.toFixed(2)).up();
    mon.ele('cbc:TaxExclusiveAmount', { currencyID: 'COP' }).txt(p.totals.taxExclusive.toFixed(2)).up();
    mon.ele('cbc:TaxInclusiveAmount', { currencyID: 'COP' }).txt(p.totals.taxInclusive.toFixed(2)).up();
    mon.ele('cbc:PayableAmount', { currencyID: 'COP' }).txt(p.totals.payable.toFixed(2)).up();
    mon.up();

    // Lineas
    const lineTag = kind === 'CREDIT' ? 'cac:CreditNoteLine' : 'cac:DebitNoteLine';
    const qtyTag = kind === 'CREDIT' ? 'cbc:CreditedQuantity' : 'cbc:DebitedQuantity';
    p.lines.forEach((l, i) => {
      const line = doc.ele(lineTag);
      line.ele('cbc:ID').txt(String(i + 1)).up();
      line.ele(qtyTag, { unitCode: 'NIU' }).txt(String(l.quantity)).up();
      line.ele('cbc:LineExtensionAmount', { currencyID: 'COP' }).txt((l.quantity * l.unitPrice).toFixed(2)).up();
      line.ele('cac:Item').ele('cbc:Description').txt(l.description).up().up();
      line.ele('cac:Price').ele('cbc:PriceAmount', { currencyID: 'COP' }).txt(l.unitPrice.toFixed(2)).up().up();
      line.up();
    });

    const xml = doc.end({ prettyPrint: false });
    return { xml, cude };
  }
}

export interface UblNoteParams {
  ambiente: AmbienteDian;
  nitOFE: string;
  pin: string; // PIN del software (para el CUDE)
  supplierName: string;
  customerName: string;
  customerId: string;
  fullNumber: string;
  issueDate: string;
  issueTime: string;
  // factura original referenciada
  originalNumber: string;
  originalCufe: string;
  originalDate: string;
  reason?: string;
  reasonCode?: string;
  lines: UblLine[];
  totals: UblTotals;
}
