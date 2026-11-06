import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../auth/decorators/permissions.decorator';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import {
  AddInspectionDto,
  MoveStageDto,
  UpdateCustomsDto,
  UpdateInspectionDto,
  VersionQueryDto,
} from './dto/customs.dto';
import { ShipmentsQueryDto } from './dto/shipments-query.dto';
import {
  ReassignDto,
  UpdateBasicDto,
  UpdateOperationDto,
} from './dto/update-shipment.dto';
import { ShipmentCustomsService } from './shipment-customs.service';
import { ShipmentEditService } from './shipment-edit.service';
import { ShipmentRegistrationService } from './shipment-registration.service';
import { ShipmentStageService } from './shipment-stage.service';
import { ShipmentsService } from './shipments.service';

@Controller('shipments')
export class ShipmentsController {
  constructor(
    private readonly shipments: ShipmentsService,
    private readonly registration: ShipmentRegistrationService,
    private readonly edits: ShipmentEditService,
    private readonly customs: ShipmentCustomsService,
    private readonly stages: ShipmentStageService,
  ) {}

  @Get()
  @RequireAnyPermission('shipments.view.all', 'shipments.view.own')
  list(@CurrentUser() actor: AuthUser, @Query() query: ShipmentsQueryDto) {
    return this.shipments.list(actor, query);
  }

  @Get(':id')
  @RequireAnyPermission('shipments.view.all', 'shipments.view.own')
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.shipments.get(actor, id);
  }

  @Post()
  @RequirePermissions('shipments.create')
  register(@CurrentUser() actor: AuthUser, @Body() dto: CreateShipmentDto) {
    return this.registration.register(actor, dto);
  }

  /** Every edit below carries the shipment version it was made on (optimistic locking). */

  @Patch(':id/basic')
  @RequirePermissions('shipments.basic.update')
  updateBasic(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBasicDto,
  ) {
    return this.edits.updateBasic(actor, id, dto);
  }

  @Patch(':id/operation')
  @RequirePermissions('shipments.operation.update')
  updateOperation(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOperationDto,
  ) {
    return this.edits.updateOperation(actor, id, dto);
  }

  @Patch(':id/operation-employee')
  @RequirePermissions('shipments.reassign')
  reassign(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReassignDto,
  ) {
    return this.edits.reassign(actor, id, dto);
  }

  @Patch(':id/customs')
  @RequirePermissions('shipments.customs.update')
  updateCustoms(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomsDto,
  ) {
    return this.customs.update(actor, id, dto);
  }

  @Post(':id/inspections')
  @RequirePermissions('shipments.customs.update')
  addInspection(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddInspectionDto,
  ) {
    return this.customs.addInspection(actor, id, dto);
  }

  @Patch(':id/inspections/:itemId')
  @RequirePermissions('shipments.customs.update')
  updateInspection(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateInspectionDto,
  ) {
    return this.customs.updateInspection(actor, id, itemId, dto);
  }

  @Delete(':id/inspections/:itemId')
  @RequirePermissions('shipments.customs.update')
  removeInspection(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query() query: VersionQueryDto,
  ) {
    return this.customs.removeInspection(actor, id, itemId, query.version);
  }

  @Post(':id/stage')
  @RequireAnyPermission('shipments.stage.operation', 'shipments.stage.customs')
  moveStage(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveStageDto,
  ) {
    return this.stages.move(actor, id, dto);
  }
}
