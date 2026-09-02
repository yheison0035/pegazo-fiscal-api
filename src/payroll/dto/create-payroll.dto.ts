import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PayrollConceptDto {
  @IsString() concept: string; // "Sueldo", "Horas extra", "Salud", "Pensión"...
  @IsOptional() @IsString() code?: string; // código DIAN del concepto
  @IsNumber() amount: number;
}

export class PayrollEmployeeDto {
  @IsString() name: string;
  @IsString() identification: string;
  @IsOptional() @IsString() idType?: string;
  @IsOptional() @IsString() position?: string; // cargo
  @IsOptional() @IsNumber() salary?: number; // salario base
}

export class PayrollPeriodDto {
  @IsString() startDate: string; // AAAA-MM-DD
  @IsString() endDate: string; // AAAA-MM-DD
  @IsOptional() @IsString() paymentDate?: string;
}

/** Documento Soporte de Pago de Nómina Electrónica (DSPNE) por empleado. */
export class CreatePayrollDto {
  @IsString() companyId: string;
  @IsOptional() @IsString() idempotencyKey?: string;

  @ValidateNested() @Type(() => PayrollEmployeeDto) employee: PayrollEmployeeDto;
  @ValidateNested() @Type(() => PayrollPeriodDto) period: PayrollPeriodDto;

  @IsArray() @ValidateNested({ each: true }) @Type(() => PayrollConceptDto)
  earnings: PayrollConceptDto[]; // devengados

  @IsArray() @ValidateNested({ each: true }) @Type(() => PayrollConceptDto)
  deductions: PayrollConceptDto[]; // deducciones

  @IsOptional() @IsString() notes?: string;
}
