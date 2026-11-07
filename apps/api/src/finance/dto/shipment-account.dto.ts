import { Currency, CollectionMethod, PaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { Trim } from '../../common/validation';
import { PositiveMoney } from '../money';

/** How one settlement item shows on the client statement; null clears an override. */
export class StatementOverrideDto {
  @IsOptional()
  @IsBoolean()
  excluded?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @IsOptional()
  @PositiveMoney()
  amount?: number | null;
}

export class ExtraLineDto {
  @IsEnum(Currency)
  currency!: Currency;

  @Trim()
  @IsString()
  @MinLength(2, { message: 'اكتب وصف البند' })
  @MaxLength(200)
  description!: string;

  @PositiveMoney()
  amount!: number;
}

export class ClearanceLineDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: 'اكتب وصف السطر' })
  @MaxLength(200)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'الكمية رقم' })
  @Min(0.01)
  quantity!: number;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'السعر رقم (رقمين عشريين بالكتير)' },
  )
  @Min(0)
  unitPrice!: number;
}

export class FinishDto {
  @IsInt()
  @Min(0)
  version!: number;

  /** Lines added to the CLEARANCE invoice after the CLEARANCE line from the quote. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ClearanceLineDto)
  clearanceLines?: ClearanceLineDto[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  invoiceDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  valueDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(60)
  customerRef?: string;

  /** The certificate number is not recorded yet: finish anyway (a warning, not a block). */
  @IsOptional()
  @IsBoolean()
  confirmNoCertificate?: boolean;
}

export class ReopenDto {
  @IsInt()
  @Min(0)
  version!: number;

  @Trim()
  @IsString()
  @MinLength(3, { message: 'اكتب سبب إعادة الفتح' })
  @MaxLength(500)
  reason!: string;
}

export class CreateCollectionDto {
  @IsInt()
  @Min(1)
  shipmentId!: number;

  @IsEnum(Currency)
  currency!: Currency;

  @PositiveMoney()
  amount!: number;

  @IsEnum(CollectionMethod)
  method!: CollectionMethod;

  /** TRANSFER: the bank account of the currency that received it. */
  @IsOptional()
  @IsInt()
  @Min(1)
  bankAccountId?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  collectionDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(60)
  reference?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateCollectionDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @PositiveMoney()
  amount?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  collectionDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(60)
  reference?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class AccountsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsEnum(['OPEN', 'FINISHED'])
  status?: 'OPEN' | 'FINISHED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clientId?: number;
}
