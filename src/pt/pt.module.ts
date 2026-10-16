import { Module } from '@nestjs/common';
import { PtController } from './pt.controller';

// PtConfigService es global (CommonModule), no hace falta declararlo aquí.
@Module({
  controllers: [PtController],
})
export class PtModule {}
