import { Module } from '@nestjs/common';
import { DianService } from './dian.service';
import { SigningModule } from '@/signing/signing.module';

@Module({
  imports: [SigningModule],
  providers: [DianService],
  exports: [DianService],
})
export class DianModule {}
