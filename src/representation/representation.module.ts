import { Module } from '@nestjs/common';
import { RepresentationService } from './representation.service';

@Module({
  providers: [RepresentationService],
  exports: [RepresentationService],
})
export class RepresentationModule {}
