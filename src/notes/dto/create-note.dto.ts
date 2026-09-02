import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceLineDto } from '@/invoices/dto/create-invoice.dto';

/**
 * Nota credito o debito sobre una factura ya emitida.
 * El tipo (credito/debito) lo define la ruta.
 */
export class CreateNoteDto {
  /** Empresa emisora. */
  @IsString() companyId: string;

  /** id de la factura original (FiscalDocument) que esta nota corrige. */
  @IsString() originalInvoiceId: string;

  /** Motivo de la nota (texto libre para la representacion). */
  @IsOptional() @IsString() reason?: string;

  /** Codigo de concepto de correccion segun el anexo DIAN. */
  @IsOptional() @IsString() reasonCode?: string;

  @IsOptional() @IsString() idempotencyKey?: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
}
