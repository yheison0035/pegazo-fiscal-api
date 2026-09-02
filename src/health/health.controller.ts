import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      service: 'pegazo-fiscal-api',
      status: 'ok',
      version: 'v1',
      time: new Date().toISOString(),
    };
  }
}
