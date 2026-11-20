import { InternalPartyKind, PartyMovementKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/validation';
import { PositiveMoney } from '../money';

export class CreatePartyDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsEnum(InternalPartyKind)
  kind!: InternalPartyKind;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** The kind stays: an owner's personal accounts hang on it. */
export class UpdatePartyDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePartyMovementDto {
  @IsInt()
  @Min(1)
  partyId!: number;

  @IsInt()
  @Min(1)
  accountId!: number;

  @IsEnum(PartyMovementKind)
  kind!: PartyMovementKind;

  @PositiveMoney()
  amount!: number;

  /** Defaults to today; may be earlier, never later. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  movementDate?: Date;

  /** Who was paid: required on a shared debt. */
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  payee?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  reference?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** The party and the kind stay; the account (same currency), amount and date may change. */
export class UpdatePartyMovementDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  accountId?: number;

  @IsOptional()
  @PositiveMoney()
  amount?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  movementDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  payee?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  reference?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class PartyStatementQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
