import { AccountType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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

  /** More roles: their permissions add to the main role's. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  extraRoleIds?: number[];
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

  /** Replaces the extra roles ([] removes them). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  extraRoleIds?: number[];

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
