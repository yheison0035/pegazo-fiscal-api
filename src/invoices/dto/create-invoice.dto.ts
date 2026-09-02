import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Una linea de la factura. */
export class InvoiceLineDto {
  @IsString() description: string;
  @IsOptional() @IsString() code?: string;
  @IsNumber() @Min(0) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
  /** Tarifa de IVA en porcentaje (0, 5, 19...). */
  @IsOptional() @IsNumber() vatRate?: number;
}

export class InvoicePartyDto {
  @IsString() name: string;
  /** NIT o documento del adquiriente. */
  @IsString() identification: string;
  @IsOptional() @IsString() idType?: string; // "31" NIT, "13" cedula...
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() cityCode?: string;
}

/**
 * Payload que la plataforma (Pegazo u otra) envia para emitir una factura.
 * El servicio normaliza, calcula impuestos, genera el UBL, firma y transmite.
 */
export class CreateInvoiceDto {
  /** Empresa emisora (id devuelto al registrar la Company en este servicio). */
  @IsString() companyId: string;

  /** 'FACTURA_VENTA' (por defecto) o 'DOCUMENTO_POS' (tiquete equivalente). */
  @IsOptional() @IsString() documentType?: string;

  /** Clave de idempotencia: reintentar con la misma no duplica la factura. */
  @IsOptional() @IsString() idempotencyKey?: string;

  @ValidateNested() @Type(() => InvoicePartyDto) customer: InvoicePartyDto;

  @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];

  /** Notas / observaciones para la representacion grafica. */
  @IsOptional() @IsString() notes?: string;
}
