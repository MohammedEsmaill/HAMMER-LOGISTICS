import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../auth/decorators/permissions.decorator';
import { UploadDocumentDto } from './dto/document.dto';
import {
  MAX_DOCUMENT_BYTES,
  ShipmentDocumentsService,
} from './shipment-documents.service';
import type { UploadedFile as File } from './shipment-documents.service';

@Controller('shipments/:id/documents')
export class ShipmentDocumentsController {
  constructor(private readonly documents: ShipmentDocumentsService) {}

  @Get()
  @RequireAnyPermission('shipments.view.all', 'shipments.view.own')
  list(@CurrentUser() actor: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.documents.list(actor, id);
  }

  /** multipart/form-data: "file" (PDF) + "name" + "category". */
  @Post()
  @RequirePermissions('shipments.documents.upload')
  @UseInterceptors(
    // a little above the limit, so the service can refuse oversize files in Arabic
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_BYTES + 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: File | undefined,
  ) {
    return this.documents.upload(
      actor,
      id,
      { name: dto.name, category: dto.category },
      file,
    );
  }

  @Delete(':documentId')
  @RequirePermissions('shipments.documents.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.documents.remove(actor, id, documentId);
  }
}
