import { Module } from '@nestjs/common';
import { UblModule } from '@/ubl/ubl.module';
import { SigningModule } from '@/signing/signing.module';
import { DianModule } from '@/dian/dian.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [UblModule, SigningModule, DianModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
