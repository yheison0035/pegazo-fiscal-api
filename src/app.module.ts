import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { InvoicesModule } from './invoices/invoices.module';
import { UblModule } from './ubl/ubl.module';
import { SigningModule } from './signing/signing.module';
import { DianModule } from './dian/dian.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    AuthModule,
    CompaniesModule,
    InvoicesModule,
    UblModule,
    SigningModule,
    DianModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
