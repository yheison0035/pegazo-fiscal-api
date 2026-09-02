import { Module } from '@nestjs/common';
import { DianService } from './dian.service';

@Module({
  providers: [DianService],
  exports: [DianService],
})
export class DianModule {}
