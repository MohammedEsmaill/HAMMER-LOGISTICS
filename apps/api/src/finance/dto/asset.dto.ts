import { AssetCategory, AssetStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { Trim } from '../../common/validation';
import { BankPaymentDto } from '../bank-payment';
import { PositiveMoney } from '../money';

/** The device itself: what it is, its serial, who holds it (a purchase adds how it was paid). */
export class AssetInfoDto extends BankPaymentDto {
  @IsEnum(AssetCategory)
  category!: AssetCategory;

  @Trim()
  @IsString()
  @MinLength(2, { message: 'اكتب اسم الجهاز' })
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  serialNo?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  custodianEmployeeId?: number;

  /** 60 (5 years) when left out */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  usefulLifeMonths?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** A device the company had before: its original date and cost, no money moving. */
export class ExistingAssetDto extends AssetInfoDto {
  @Type(() => Date)
  @IsDate()
  acquiredOn!: Date;

  @PositiveMoney()
  cost!: number;
}

/** Buying a device: paid from the EGP cash box or an EGP bank account. */
export class PurchaseAssetDto extends AssetInfoDto {
  @PositiveMoney()
  cost!: number;

  @IsInt()
  @Min(1)
  accountId!: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(40)
  reference?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  supplier?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(40)
  invoiceNo?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  purchaseDate?: Date;
}

export class UpdateAssetDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsEnum(AssetCategory)
  category?: AssetCategory;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  model?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  serialNo?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  location?: string | null;

  /** null: nobody holds it */
  @IsOptional()
  @IsInt()
  custodianEmployeeId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  usefulLifeMonths?: number;

  /** a device the company had before: its date and cost */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  acquiredOn?: Date;

  @IsOptional()
  @PositiveMoney()
  cost?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

/** Selling a device (money in) or scrapping it (none). */
export class DisposeAssetDto extends BankPaymentDto {
  @IsIn(['SALE', 'SCRAP'])
  kind!: 'SALE' | 'SCRAP';

  /** SALE: the price */
  @IsOptional()
  @PositiveMoney()
  amount?: number;

  /** SALE: the account it comes into */
  @IsOptional()
  @IsInt()
  @Min(1)
  accountId?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(40)
  reference?: string;

  /** SALE: the buyer */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  buyer?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @Trim()
  @IsString()
  @MinLength(3, { message: 'اكتب السبب أو التفاصيل' })
  @MaxLength(500)
  notes!: string;
}

/** Correcting a purchase or a sale before it is approved (its author), or after (the CEO). */
export class UpdateAssetTxDto extends BankPaymentDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @PositiveMoney()
  amount?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(40)
  reference?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  party?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(40)
  invoiceNo?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class AssetsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(AssetCategory)
  category?: AssetCategory;

  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  custodianEmployeeId?: number;
}
