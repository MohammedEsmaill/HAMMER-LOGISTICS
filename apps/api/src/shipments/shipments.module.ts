import { Module } from '@nestjs/common';
import { FileNumberService } from './file-number.service';
import { ShipmentCustomsService } from './shipment-customs.service';
import { ShipmentEditService } from './shipment-edit.service';
import { ShipmentRegistrationService } from './shipment-registration.service';
import { ShipmentStageService } from './shipment-stage.service';
import { ShipmentValidator } from './shipment-validator.service';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

@Module({
  controllers: [ShipmentsController],
  providers: [
    ShipmentsService,
    ShipmentValidator,
    ShipmentRegistrationService,
    ShipmentEditService,
    ShipmentCustomsService,
    ShipmentStageService,
    FileNumberService,
  ],
})
export class ShipmentsModule {}
