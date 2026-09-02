import { Module } from '@nestjs/common';
import { UblModule } from '@/ubl/ubl.module';
import { SigningModule } from '@/signing/signing.module';
import { DianModule } from '@/dian/dian.module';
import { RepresentationModule } from '@/representation/representation.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

// CommonModule (CryptoService) es @Global, no hace falta importarlo aqui.
@Module({
  imports: [UblModule, SigningModule, DianModule, RepresentationModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
