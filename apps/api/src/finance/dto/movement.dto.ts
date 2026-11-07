import {
  ApprovalStatus,
  MoneyDirection,
  OtherMovementKind,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { Trim } from '../../common/validation';
import { PositiveMoney } from '../money';

export class CreateTransferDto {
  @IsInt()
  @Min(1)
  fromAccountId!: number;

  @IsInt()
  @Min(1)
  toAccountId!: number;

  @PositiveMoney()
  amount!: number;

  /** Required when money leaves a bank account (cheque / transfer reference). */
  @IsOptional()
  @Trim()
  @Matches(/^[A-Za-z0-9-]{1,30}$/, { message: 'رقم الشيك حروف وأرقام بس' })
  chequeNo?: string;

  /** Defaults to today; may be earlier, never later. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  transferDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** Accounts and amount may change; the edit reverses the old lines and posts new ones. */
export class UpdateTransferDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  fromAccountId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  toAccountId?: number;

  @IsOptional()
  @PositiveMoney()
  amount?: number;

  @IsOptional()
  @Trim()
  @Matches(/^[A-Za-z0-9-]{1,30}$/, { message: 'رقم الشيك حروف وأرقام بس' })
  chequeNo?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  transferDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CreateOtherMovementDto {
  @IsInt()
  @Min(1)
  accountId!: number;

  @IsEnum(OtherMovementKind)
  kind!: OtherMovementKind;

  /** Only for ADJUSTMENT; FUNDING is always IN and BANK_CHARGES always OUT. */
  @IsOptional()
  @IsEnum(MoneyDirection)
  direction?: MoneyDirection;

  @PositiveMoney()
  amount!: number;

  @Trim()
  @IsString()
  @MinLength(3, { message: 'اكتب السبب (3 حروف على الأقل)' })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  movementDate?: Date;
}

export class UpdateOtherMovementDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @PositiveMoney()
  amount?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(3, { message: 'اكتب السبب (3 حروف على الأقل)' })
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  movementDate?: Date;
}

export class MovementsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  accountId?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
