import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { QuotaService } from './quota.service';
import { MailerService } from './mailer.service';

@Global()
@Module({
  providers: [CryptoService, QuotaService, MailerService],
  exports: [CryptoService, QuotaService, MailerService],
})
export class CommonModule {}
