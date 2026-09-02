import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '@/auth/api-key.guard';
import { PlatformId } from '@/auth/platform.decorator';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Controller('invoices')
@UseGuards(ApiKeyGuard)
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Post()
  create(@PlatformId() platformId: string, @Body() dto: CreateInvoiceDto) {
    return this.service.create(platformId, dto);
  }

  @Get(':id')
  get(@PlatformId() platformId: string, @Param('id') id: string) {
    return this.service.get(platformId, id);
  }
}
