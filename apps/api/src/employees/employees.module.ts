import { PersonalDataBackfill } from '../common/crypto/personal-data-backfill.service';
import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, PersonalDataBackfill],
})
export class EmployeesModule {}
