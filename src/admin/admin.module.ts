import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';

// PrismaService y ApiKeyService vienen de modulos @Global.
@Module({
  controllers: [AdminController],
})
export class AdminModule {}
