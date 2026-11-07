import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { FileNumberService } from './file-number.service';
import { ShipmentCustomsService } from './shipment-customs.service';
import { ShipmentDocumentsController } from './shipment-documents.controller';
import { ShipmentDocumentsService } from './shipment-documents.service';
import { ShipmentEditService } from './shipment-edit.service';
import { ShipmentRegistrationService } from './shipment-registration.service';
import { ShipmentStageService } from './shipment-stage.service';
import { ShipmentValidator } from './shipment-validator.service';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

@Module({
  imports: [FinanceModule],
  controllers: [ShipmentsController, ShipmentDocumentsController],
  providers: [
    ShipmentsService,
    ShipmentValidator,
    ShipmentRegistrationService,
    ShipmentEditService,
    ShipmentCustomsService,
    ShipmentStageService,
    ShipmentDocumentsService,
    FileNumberService,
  ],
})
export class ShipmentsModule {}
