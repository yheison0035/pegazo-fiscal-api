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

  @Get(':id')
  get(@PlatformId() platformId: string, @Param('id') id: string) {
    return this.service.get(platformId, id);
  }
}
