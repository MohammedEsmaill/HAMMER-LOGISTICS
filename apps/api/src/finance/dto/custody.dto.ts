import {
  ApprovalStatus,
  CustodyHolder,
  CustodyPurpose,
  CustodyStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  NotEquals,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { Trim } from '../../common/validation';
import { PositiveMoney } from '../money';

export class IssueCustodyDto {
  @IsInt()
  @Min(1)
  shipmentId!: number;

  @IsEnum(CustodyHolder)
  holderType!: CustodyHolder;

  /** AGENT: an active employee of the agents department. */
  @IsOptional()
  @IsInt()
  @Min(1)
  agentEmployeeId?: number;

  /** Not for BANK_TRANSFER. */
  @IsOptional()
  @IsEnum(CustodyPurpose)
  purpose?: CustodyPurpose;

  /** BANK_TRANSFER only: the bank account paid from (EGP or USD). */
  @IsOptional()
  @IsInt()
  @Min(1)
  bankAccountId?: number;

  @PositiveMoney()
  amount!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  issueDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** While the custody is open: the amount, date and notes. */
export class UpdateIssueDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @PositiveMoney()
  amount?: number;

  @IsOptional()
  @IsEnum(CustodyPurpose)
  purpose?: CustodyPurpose;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  issueDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CustodyItemDto {
  /** By name: a new type joins the shipment expense list automatically. */
  @Trim()
  @IsString()
  @MinLength(2, { message: 'اكتب نوع المصروف' })
  @MaxLength(100)
  expenseType!: string;

  @PositiveMoney()
  amount!: number;

  /** Digits only; printed as PAYMENT RECEIPT NO- + the number. */
  @IsOptional()
  @Trim()
  @Matches(/^[0-9]{1,20}$/, { message: 'رقم الإيصال أرقام بس' })
  receiptNo?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class SettleCustodyDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'التصفية لازم يبقى فيها بند واحد على الأقل' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CustodyItemDto)
  items!: CustodyItemDto[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  settlementDate?: Date;
}

export class CustodiesQueryDto extends ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shipmentId?: number;

  @IsOptional()
  @IsEnum(CustodyStatus)
  status?: CustodyStatus;

  @IsOptional()
  @IsEnum(CustodyHolder)
  holderType?: CustodyHolder;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clearerId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  agentEmployeeId?: number;

  @IsOptional()
  @IsEnum(ApprovalStatus)
  approvalStatus?: ApprovalStatus;
}

export class PayFeeDto {
  @IsInt()
  @Min(1)
  feeId!: number;

  @PositiveMoney()
  amount!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paymentDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateFeePaymentDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @PositiveMoney()
  amount?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paymentDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

/** CEO: change a fee by an amount (+ or −) with the reason. */
export class AdjustFeeDto {
  @IsInt()
  @Min(1)
  feeId!: number;

  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'المبلغ رقم موجب أو سالب (رقمين عشريين بالكتير)' },
  )
  @NotEquals(0, { message: 'مبلغ التسوية مينفعش يبقى صفر' })
  amount!: number;

  @Trim()
  @IsString()
  @MinLength(3, { message: 'اكتب سبب التسوية' })
  @MaxLength(500)
  notes!: string;
}

export class FeesQueryDto extends ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clearerId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shipmentId?: number;
}
