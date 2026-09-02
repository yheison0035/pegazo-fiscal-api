import {
  IsBase64,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCompanyDto {
  @IsString() nit: string;
  @IsOptional() @IsString() dv?: string;
  @IsString() legalName: string;
  @IsOptional() @IsString() tradeName?: string;
  /** id de la empresa dentro de la plataforma cliente (p.ej. companyId del CRM). */
  @IsOptional() @IsString() externalId?: string;
}

export class UploadCertificateDto {
  /** Archivo .p12 en base64. */
  @IsBase64() p12Base64: string;
  /** Clave del .p12. */
  @IsString() password: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class CreateResolutionDto {
  @IsString() documentType: string; // FACTURA_VENTA, NOTA_CREDITO...
  @IsString() prefix: string;
  @IsString() resolution: string;
  @IsOptional() @IsString() technicalKey?: string;
  @IsInt() @Min(0) rangeFrom: number;
  @IsInt() @Min(0) rangeTo: number;
  @IsDateString() validFrom: string;
  @IsDateString() validTo: string;
}
