import {
  ApprovalStatus,
  CustodyHolder,
  CustodyPurpose,
  CustodyStatus,
  ReceiptKind,
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
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
  ValidateIf,
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

  /** BANK_TRANSFER only: the external account paid (shipping agency, clearer, other). */
  @IsOptional()
  @IsInt()
  @Min(1)
  beneficiaryId?: number;

  @IsOptional()
  @Trim()
  @Matches(/^[A-Za-z0-9/-]{1,40}$/, { message: 'رقم التحويل حروف وأرقام بس' })
  transferRef?: string;

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
  /**
   * A fixed-price settlement item (clearer custodies only): its name and amount come
   * from the price list, so expenseType and amount are not sent.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  settlementItemId?: number;

  /** By name: a new type joins the shipment expense list automatically. */
  @ValidateIf((o: CustodyItemDto) => !o.settlementItemId)
  @Trim()
  @IsString()
  @MinLength(2, { message: 'اكتب نوع المصروف' })
  @MaxLength(100)
  expenseType?: string;

  @ValidateIf((o: CustodyItemDto) => !o.settlementItemId)
  @PositiveMoney()
  amount?: number;

  /** Digits and dashes, e.g. 861-26 (number - year). */
  @IsOptional()
  @Trim()
  @Matches(/^[0-9]+(-[0-9]+)*$/, {
    message: 'رقم الإيصال أرقام وشرطة بس (زي 861-26)',
  })
  @MaxLength(30)
  receiptNo?: string;

  /** What the receipt is: it sets the statement line (default PAYMENT RECEIPT NO). */
  @IsOptional()
  @IsEnum(ReceiptKind)
  receiptKind?: ReceiptKind;

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

  /** The EGP cash box (default) or an EGP bank account; a bank pays into the clearer's account. */
  @IsOptional()
  @IsInt()
  @Min(1)
  accountId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  beneficiaryId?: number;

  @IsOptional()
  @Trim()
  @Matches(/^[A-Za-z0-9/-]{1,40}$/, { message: 'رقم التحويل حروف وأرقام بس' })
  transferRef?: string;

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
