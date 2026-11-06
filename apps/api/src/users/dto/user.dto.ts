import { AccountType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const normaliseEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const COMPANY_EMAIL = /@hammerline\.com$/;
const COMPANY_EMAIL_MESSAGE = 'الإيميل لازم ينتهي بـ @hammerline.com';

export class CreateUserDto {
  @IsEnum(AccountType)
  accountType!: AccountType;

  @IsInt()
  @Min(1)
  ownerId!: number; // employee id or clearer id, per accountType

  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'الإيميل غير صحيح' })
  @Matches(COMPANY_EMAIL, { message: COMPANY_EMAIL_MESSAGE })
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;

  @IsInt()
  @Min(1)
  roleId!: number;
}

export class UpdateUserDto {
  @IsOptional()
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'الإيميل غير صحيح' })
  @Matches(COMPANY_EMAIL, { message: COMPANY_EMAIL_MESSAGE })
  email?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  roleId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class CandidatesQueryDto {
  @IsEnum(AccountType)
  type!: AccountType;
}
