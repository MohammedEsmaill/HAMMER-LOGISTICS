import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { ShipmentsQueryDto } from './dto/shipments-query.dto';
import { ShipmentRegistrationService } from './shipment-registration.service';
import { ShipmentsService } from './shipments.service';

@Controller('shipments')
export class ShipmentsController {
  constructor(
    private readonly shipments: ShipmentsService,
    private readonly registration: ShipmentRegistrationService,
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
}
