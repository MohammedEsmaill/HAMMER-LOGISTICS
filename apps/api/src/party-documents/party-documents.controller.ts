import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../auth/decorators/permissions.decorator';
import { Trim } from '../common/validation';
import {
  MAX_PARTY_DOCUMENT_BYTES,
  PartyDocumentsService,
} from './party-documents.service';

const VIEW = ['documents.view.all', 'documents.view.own'] as const;
// multipart fields arrive as text: "" means not given
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === 'null' ? undefined : value;

export class PartyDocumentFieldsDto {
  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  factoryId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  typeId!: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Trim()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Trim()
  @IsString()
  @MaxLength(60)
  number?: string;

  @Type(() => Date)
  @IsDate({ message: 'اكتب تاريخ الإصدار' })
  issueDate!: Date;

  @Type(() => Date)
  @IsDate({ message: 'اكتب تاريخ الانتهاء' })
  expiryDate!: Date;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreatePartyDocumentDto extends PartyDocumentFieldsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clientId!: number;
}

export class CardsQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class PartyQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  factoryId?: number;
}

const upload = FileInterceptor('file', {
  limits: { fileSize: MAX_PARTY_DOCUMENT_BYTES + 1024 * 1024 },
});

/** The documents center: client and factory papers with their validity. */
@Controller('party-documents')
export class PartyDocumentsController {
  constructor(private readonly docs: PartyDocumentsService) {}

  @Get('types')
  @RequireAnyPermission(...VIEW)
  types() {
    return this.docs.types();
  }

  @Get('cards')
  @RequireAnyPermission(...VIEW)
  cards(@CurrentUser() actor: AuthUser, @Query() q: CardsQueryDto) {
    return this.docs.cards(actor, q.search);
  }

  @Get()
  @RequireAnyPermission(...VIEW)
  list(@CurrentUser() actor: AuthUser, @Query() q: PartyQueryDto) {
    return this.docs.list(actor, q.clientId, q.factoryId);
  }

  /** Shown while registering a shipment: whoever registers sees what needs renewing. */
  @Get('warnings')
  @RequirePermissions('shipments.create')
  warnings(@Query() q: PartyQueryDto) {
    return this.docs.warnings(q.clientId, q.factoryId);
  }

  @Post()
  @RequirePermissions('documents.manage')
  @UseInterceptors(upload)
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreatePartyDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.docs.create(actor, dto, file);
  }

  @Patch(':id')
  @RequirePermissions('documents.manage')
  @UseInterceptors(upload)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PartyDocumentFieldsDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.docs.update(actor, id, dto, file);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('documents.manage')
  async remove(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.docs.remove(actor, id);
  }
}
