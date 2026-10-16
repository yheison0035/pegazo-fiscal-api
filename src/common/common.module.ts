import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { QuotaService } from './quota.service';
import { MailerService } from './mailer.service';
import { PtConfigService } from './pt-config.service';

@Global()
@Module({
  providers: [CryptoService, QuotaService, MailerService, PtConfigService],
  exports: [CryptoService, QuotaService, MailerService, PtConfigService],
})
export class CommonModule {}
