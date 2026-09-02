import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '@/auth/api-key.guard';
import { PlatformId } from '@/auth/platform.decorator';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';

@Controller()
@UseGuards(ApiKeyGuard)
export class NotesController {
  constructor(private readonly service: NotesService) {}

  @Post('credit-notes')
  createCredit(
    @PlatformId() platformId: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.service.create(platformId, dto, 'CREDIT');
  }

  @Post('debit-notes')
  createDebit(@PlatformId() platformId: string, @Body() dto: CreateNoteDto) {
    return this.service.create(platformId, dto, 'DEBIT');
  }

  // Anula una factura generando su nota crédito total.
  @Post('invoices/:id/annul')
  annul(
    @PlatformId() platformId: string,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.service.annul(platformId, id, body?.reason);
  }
}
