import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '@/auth/api-key.guard';
import { PlatformId } from '@/auth/platform.decorator';
import { DocumentsService } from './documents.service';

@Controller('documents')
@UseGuards(ApiKeyGuard)
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  list(
    @PlatformId() platformId: string,
    @Query()
    q: {
      companyId?: string;
      type?: string;
      status?: string;
      search?: string;
      page?: string;
      limit?: string;
    },
  ) {
    return this.service.list(platformId, {
      ...q,
      page: q.page ? Number(q.page) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  }

  @Get('stats')
  stats(
    @PlatformId() platformId: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.stats(platformId, companyId);
  }
}
