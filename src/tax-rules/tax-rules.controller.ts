import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '@/auth/api-key.guard';
import { PlatformId } from '@/auth/platform.decorator';
import { TaxRulesService } from './tax-rules.service';

/**
 * Motor normativo DIAN (parametrizable). Todas las rutas exigen API key.
 *   GET  /v1/tax-rules/parameters?year=  -> UVT y topes vigentes (editables)
 *   POST /v1/tax-rules/parameters        -> override de un parámetro por plataforma
 *   GET  /v1/tax-rules/catalog           -> responsabilidades RUT y tipos de obligación
 *   POST /v1/tax-rules/evaluate          -> ¿debe declarar renta? + obligaciones
 */
@Controller('tax-rules')
@UseGuards(ApiKeyGuard)
export class TaxRulesController {
  constructor(private readonly service: TaxRulesService) {}

  @Get('parameters')
  parameters(@PlatformId() platformId: string, @Query('year') year?: string) {
    return this.service.parameters(platformId, year ? Number(year) : undefined);
  }

  @Post('parameters')
  upsertParameter(@PlatformId() platformId: string, @Body() dto: any) {
    return this.service.upsertParameter(platformId, dto);
  }

  @Get('catalog')
  catalog() {
    return this.service.catalog();
  }

  @Post('evaluate')
  evaluate(@PlatformId() platformId: string, @Body() dto: any) {
    return this.service.evaluate(platformId, dto);
  }
}
