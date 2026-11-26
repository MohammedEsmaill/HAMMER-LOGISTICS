import {
  Body,
  Controller,
  Delete,
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
  /** The name written in Ruqaa as the signature. */
  @IsString()
  @MaxLength(60)
  name!: string;
}

/** The users' signatures on the invoices: the CEO and the moderator only. */
@Controller('users')
@RequirePermissions('users.signatures')
export class UserSignatureController {
  constructor(private readonly signatures: UserSignatureService) {}

  @Put(':id/signature')
  set(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SignatureDto,
  ) {
    return this.signatures.set(actor, id, dto.name);
  }

  /** Back to the employee's name. */
  @Delete(':id/signature')
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.signatures.set(actor, id, null);
  }
}
