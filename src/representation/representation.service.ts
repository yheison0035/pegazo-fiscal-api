import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { DianEnv } from '@prisma/client';

/**
 * Representacion grafica de un documento electronico (lo que ve el cliente final).
 *
 * El codigo QR de la DIAN apunta al catalogo de consulta con el CUFE/CUDE:
 *   https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=<CUFE>
 * (mismo host en habilitacion y produccion).
 */
@Injectable()
export class RepresentationService {
  qrContent(cufe: string, _env: DianEnv): string {
    return `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`;
  }

  async qrDataUrl(content: string): Promise<string> {
    return QRCode.toDataURL(content, { margin: 1, width: 180 });
  }

  /** HTML imprimible (el navegador lo pasa a PDF). Datos minimos legibles. */
  async buildHtml(params: {
    companyName: string;
    nit: string;
    docTypeLabel: string;
    fullNumber: string;
    cufe: string;
    issueDate: string;
    env: DianEnv;
    customerName?: string;
    lines?: { description: string; quantity: number; unitPrice: number }[];
    total?: number;
  }): Promise<string> {
    const qr = await this.qrDataUrl(this.qrContent(params.cufe, params.env));
    const money = (n: number) =>
      '$' + (n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
    const rows = (params.lines || [])
      .map(
        (l) =>
          `<tr><td>${escapeHtml(l.description)}</td><td class="r">${l.quantity}</td><td class="r">${money(
            l.unitPrice,
          )}</td><td class="r">${money(l.quantity * l.unitPrice)}</td></tr>`,
      )
      .join('');

    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${escapeHtml(params.fullNumber)}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1714;max-width:640px;margin:24px auto;padding:0 18px;font-size:13px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #ea580c;padding-bottom:12px}
  h1{font-size:16px;margin:0}
  .muted{color:#857b71;font-size:12px}
  .badge{display:inline-block;background:#fff1e8;color:#b8430a;font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{padding:7px 8px;border-bottom:1px solid #e7ded3;text-align:left}
  th{font-size:11px;text-transform:uppercase;color:#857b71}
  .r{text-align:right}
  .total{font-size:15px;font-weight:700;text-align:right;margin-top:6px}
  .foot{display:flex;gap:16px;align-items:center;margin-top:20px;border-top:1px solid #e7ded3;padding-top:14px}
  .cufe{font-family:monospace;font-size:10px;word-break:break-all;color:#4a423c}
</style></head><body>
  <div class="head">
    <div>
      <h1>${escapeHtml(params.companyName)}</h1>
      <div class="muted">NIT ${escapeHtml(params.nit)}</div>
    </div>
    <div style="text-align:right">
      <div class="badge">${escapeHtml(params.docTypeLabel)}</div>
      <div style="font-weight:700;margin-top:6px">${escapeHtml(params.fullNumber)}</div>
      <div class="muted">${escapeHtml(params.issueDate)}${params.env === 'HABILITACION' ? ' · PRUEBAS' : ''}</div>
    </div>
  </div>
  ${params.customerName ? `<p class="muted">Cliente: <b style="color:#1c1714">${escapeHtml(params.customerName)}</b></p>` : ''}
  <table><thead><tr><th>Descripción</th><th class="r">Cant.</th><th class="r">V. unit.</th><th class="r">Total</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="4" class="muted">Sin líneas</td></tr>'}</tbody></table>
  ${params.total != null ? `<div class="total">Total: ${money(params.total)}</div>` : ''}
  <div class="foot">
    <img src="${qr}" width="130" height="130" alt="QR DIAN"/>
    <div>
      <div class="muted">CUFE/CUDE</div>
      <div class="cufe">${escapeHtml(params.cufe)}</div>
      <div class="muted" style="margin-top:8px">Validación previa DIAN · escanea el QR para consultar en el catálogo oficial.</div>
    </div>
  </div>
</body></html>`;
  }
}

function escapeHtml(s: string): string {
  return String(s || '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string,
  );
}
