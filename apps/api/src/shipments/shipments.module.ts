import { Module } from '@nestjs/common';
import { FileNumberService } from './file-number.service';
import { ShipmentRegistrationService } from './shipment-registration.service';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

@Module({
  controllers: [ShipmentsController],
  providers: [ShipmentsService, ShipmentRegistrationService, FileNumberService],
})
export class ShipmentsModule {}
