import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '@/auth/api-key.guard';
import { PlatformId } from '@/auth/platform.decorator';
import { PayrollService } from './payroll.service';
import { CreatePayrollDto } from './dto/create-payroll.dto';

@Controller('payroll')
@UseGuards(ApiKeyGuard)
export class PayrollController {
  constructor(private readonly service: PayrollService) {}

  @Post()
  create(@PlatformId() platformId: string, @Body() dto: CreatePayrollDto) {
    return this.service.create(platformId, dto);
  }

  // Nota de ajuste de REEMPLAZO (corrige la nómina con datos nuevos).
  @Post(':id/replace')
  replace(
    @PlatformId() platformId: string,
    @Param('id') id: string,
    @Body() dto: CreatePayrollDto,
  ) {
    return this.service.adjust(platformId, id, 'REEMPLAZO', dto);
  }

  // Nota de ajuste de ELIMINACIÓN (borra una nómina mal enviada).
  @Post(':id/eliminate')
  eliminate(
    @PlatformId() platformId: string,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.service.adjust(platformId, id, 'ELIMINACION', undefined, body?.reason);
  }

  @Get(':id')
  get(@PlatformId() platformId: string, @Param('id') id: string) {
    return this.service.get(platformId, id);
  }
}
