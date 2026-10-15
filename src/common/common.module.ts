import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { QuotaService } from './quota.service';

@Global()
@Module({
  providers: [CryptoService, QuotaService],
  exports: [CryptoService, QuotaService],
})
export class CommonModule {}
