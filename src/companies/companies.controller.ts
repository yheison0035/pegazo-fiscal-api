import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '@/auth/api-key.guard';
import { PlatformId } from '@/auth/platform.decorator';
import { CompaniesService } from './companies.service';
import {
  CreateCompanyDto,
  CreateResolutionDto,
  UploadCertificateDto,
} from './dto/company.dto';

@Controller('companies')
@UseGuards(ApiKeyGuard)
export class CompaniesController {
  constructor(private readonly service: CompaniesService) {}

  @Post()
  create(@PlatformId() platformId: string, @Body() dto: CreateCompanyDto) {
    return this.service.create(platformId, dto);
  }

  @Get()
  list(@PlatformId() platformId: string) {
    return this.service.list(platformId);
  }

  @Get(':id')
  get(@PlatformId() platformId: string, @Param('id') id: string) {
    return this.service.get(platformId, id);
  }

  @Post(':id/certificate')
  uploadCert(
    @PlatformId() platformId: string,
    @Param('id') id: string,
    @Body() dto: UploadCertificateDto,
  ) {
    return this.service.uploadCertificate(platformId, id, dto);
  }

  @Post(':id/resolutions')
  addResolution(
    @PlatformId() platformId: string,
    @Param('id') id: string,
    @Body() dto: CreateResolutionDto,
  ) {
    return this.service.addResolution(platformId, id, dto);
  }
}
