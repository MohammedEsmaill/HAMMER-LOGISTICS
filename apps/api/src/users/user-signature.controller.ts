import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { UserSignatureService } from './user-signature.service';

export class SignatureDto {
  /** A PNG / JPEG / WEBP data URL. */
  @IsString()
  @MaxLength(90_000)
  image!: string;
}

/** The users' signatures on the invoices: the CEO and the moderator only. */
@Controller('users')
@RequirePermissions('users.signatures')
export class UserSignatureController {
  constructor(private readonly signatures: UserSignatureService) {}

  @Get(':id/signature')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.signatures.get(id);
  }

  @Put(':id/signature')
  set(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SignatureDto,
  ) {
    return this.signatures.set(actor, id, dto.image);
  }

  @Delete(':id/signature')
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.signatures.set(actor, id, null);
  }
}
