import { Module } from '@nestjs/common';
import { UblModule } from '@/ubl/ubl.module';
import { SigningModule } from '@/signing/signing.module';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [UblModule, SigningModule],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
