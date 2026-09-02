import { Module } from '@nestjs/common';
import { UblService } from './ubl.service';

@Module({
  providers: [UblService],
  exports: [UblService],
})
export class UblModule {}
