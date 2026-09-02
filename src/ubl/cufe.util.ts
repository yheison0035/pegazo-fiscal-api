import { createHash } from 'crypto';

/**
 * Calculo del CUFE (facturas) y CUDE (notas y documento POS) segun el
 * Anexo Tecnico de Factura Electronica de Venta v1.9 de la DIAN.
 *
 * CUFE = SHA-384( NumFac + FecFac + HorFac + ValFac + CodImp1 + ValImp1 +
 *                 CodImp2 + ValImp2 + CodImp3 + ValImp3 + ValTot +
 *                 NitOFE + NumAdq + ClTec + TipoAmbiente )
 *
 * - Los valores monetarios van con DOS decimales y punto como separador.
 * - CodImp1=01 (IVA), CodImp2=04 (INC), CodImp3=03 (ICA).
 * - ClTec (clave tecnica) solo aplica a la factura de venta; para notas se usa
 *   el CUDE que reemplaza ClTec por el PIN del software (ver cudeInput()).
 * - TipoAmbiente: 1=Produccion, 2=Habilitacion.
 */

export type AmbienteDian = 1 | 2;

export interface CufeInput {
  numFac: string; // numero de factura (prefijo + consecutivo)
  fecFac: string; // fecha AAAA-MM-DD
  horFac: string; // hora HH:MM:SS-05:00
  valFac: number; // valor bruto (subtotal antes de impuestos)
  valImpuesto1: number; // IVA (01)
  valImpuesto2: number; // INC (04)
  valImpuesto3: number; // ICA (03)
  valTot: number; // valor total a pagar
  nitOFE: string; // NIT del emisor (sin DV)
  numAdq: string; // documento del adquiriente
  claveTecnica: string; // ClTec (factura) — para notas, el PIN del software
  ambiente: AmbienteDian;
}

function money(n: number): string {
  return n.toFixed(2);
}

/** Construye la cadena base del CUFE y devuelve el hash SHA-384 en hex minuscula. */
export function calcCufe(input: CufeInput): string {
  const base = [
    input.numFac,
    input.fecFac,
    input.horFac,
    money(input.valFac),
    '01',
    money(input.valImpuesto1),
    '04',
    money(input.valImpuesto2),
    '03',
    money(input.valImpuesto3),
    money(input.valTot),
    input.nitOFE,
    input.numAdq,
    input.claveTecnica,
    String(input.ambiente),
  ].join('');

  return createHash('sha384').update(base, 'utf8').digest('hex');
}

/**
 * CUDE para notas credito/debito y documento POS: identica formula pero
 * la posicion de ClTec la ocupa el PIN del software (no hay clave tecnica).
 */
export function calcCude(input: Omit<CufeInput, 'claveTecnica'> & { pin: string }): string {
  return calcCufe({ ...input, claveTecnica: input.pin });
}
