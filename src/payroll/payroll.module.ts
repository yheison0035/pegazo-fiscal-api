import { Module } from '@nestjs/common';
import { SigningModule } from '@/signing/signing.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  imports: [SigningModule],
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
