import { ApprovalStatus, ExpenseCategory } from '@prisma/client';
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
import { BankPaymentDto } from '../bank-payment';
import { PositiveMoney } from '../money';

/**
 * The type is typed by name: a new name joins the list automatically, under the main
 * item given with it. Paid from the EGP cash box unless an EGP bank account is chosen.
 */
export class CreateExpenseDto extends BankPaymentDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: 'اكتب نوع المصروف' })
  @MaxLength(100)
  expenseType!: string;

  /** The main item, required when the type is new. */
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  /** An EGP bank account; the EGP cash box when left out. */
  @IsOptional()
  @IsInt()
  @Min(1)
  accountId?: number;

  /** From a bank: the transfer reference or cheque number. */
  @IsOptional()
  @Trim()
  @Matches(/^[A-Za-z0-9/-]{1,30}$/, {
    message: 'الرقم المرجعي حروف وأرقام بس',
  })
  reference?: string;

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

/** The account stays; amount, date, method, reference and charges may change. */
export class UpdateExpenseDto extends BankPaymentDto {
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
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @Trim()
  @Matches(/^[A-Za-z0-9/-]{1,30}$/, {
    message: 'الرقم المرجعي حروف وأرقام بس',
  })
  reference?: string;

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
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(150)
  payee?: string;

  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;
}

/** Moves a general expense type under another main item. */
export class UpdateExpenseTypeDto {
  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;
}
