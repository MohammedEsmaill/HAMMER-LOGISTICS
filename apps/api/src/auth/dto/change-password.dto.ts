import { IsString, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MaxLength(128)
  newPassword!: string;
}
