import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '@/auth/api-key.guard';
import { PtConfigService } from '@/common/pt-config.service';

// Datos NO secretos del Proveedor Tecnológico (Pegazo) que el cliente necesita
// para asociarse en la DIAN (NIT y software). Protegido por API key.
@Controller('pt')
@UseGuards(ApiKeyGuard)
export class PtController {
  constructor(private readonly ptConfig: PtConfigService) {}

  @Get('info')
  async info() {
    return (await this.ptConfig.publicInfo()) || {};
  }
}
