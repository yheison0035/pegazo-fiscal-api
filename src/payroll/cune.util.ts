import { createHash } from 'crypto';
import { AmbienteDian } from '@/ubl/cufe.util';

/**
 * CUNE — Código Único del Documento Soporte de Pago de Nómina Electrónica.
 * Según el Anexo Técnico de Nómina Electrónica de la DIAN:
 *
 * CUNE = SHA-384( NumNIE + FecNIE + HorNIE + ValDev + ValDed + ValTolPa +
 *                 NitNIE + DocEmp + TipoAmbiente + SoftwarePin )
 *
 * - ValDev = total devengado, ValDed = total deducciones, ValTolPa = total a pagar.
 * - Valores con dos decimales y punto.
 * - TipoAmbiente: 1 producción, 2 habilitación.
 */
export interface CuneInput {
  numero: string; // consecutivo del documento (prefijo + número)
  fecha: string; // AAAA-MM-DD
  hora: string; // HH:MM:SS-05:00
  totalDevengado: number;
  totalDeducciones: number;
  totalPagar: number;
  nitEmpleador: string;
  documentoEmpleado: string;
  ambiente: AmbienteDian;
  softwarePin: string;
}

const money = (n: number) => n.toFixed(2);

export function calcCune(i: CuneInput): string {
  const base = [
    i.numero,
    i.fecha,
    i.hora,
    money(i.totalDevengado),
    money(i.totalDeducciones),
    money(i.totalPagar),
    i.nitEmpleador,
    i.documentoEmpleado,
    String(i.ambiente),
    i.softwarePin,
  ].join('');
  return createHash('sha384').update(base, 'utf8').digest('hex');
}
