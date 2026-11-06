import { Module } from '@nestjs/common';
import { ClientsController, FactoriesController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  controllers: [ClientsController, FactoriesController],
  providers: [ClientsService],
})
export class ClientsModule {}
