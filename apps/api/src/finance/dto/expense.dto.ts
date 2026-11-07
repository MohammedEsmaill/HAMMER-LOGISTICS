import { ApprovalStatus } from '@prisma/client';
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

/** The type is typed by name: a new name joins the list automatically. */
export class CreateExpenseDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: 'اكتب نوع المصروف' })
  @MaxLength(100)
  expenseType!: string;

  @Trim()
  @IsString()
  @MinLength(2, { message: 'اكتب الجهة اللي اتدفعلها' })
  @MaxLength(150)
  payee!: string;

  @PositiveMoney()
  amount!: number;

  /** Required; stored as written (digits and letters). */
  @Trim()
  @Matches(/^[A-Za-z0-9/-]{1,30}$/, {
    message: 'رقم الإيصال إجباري (حروف وأرقام)',
  })
  receiptNo!: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expenseDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateExpenseDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  expenseType?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  payee?: string;

  @IsOptional()
  @PositiveMoney()
  amount?: number;

  @IsOptional()
  @Trim()
  @Matches(/^[A-Za-z0-9/-]{1,30}$/, {
    message: 'رقم الإيصال إجباري (حروف وأرقام)',
  })
  receiptNo?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expenseDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class ExpensesQueryDto extends ListQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expenseTypeId?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(150)
  payee?: string;

  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;
}
