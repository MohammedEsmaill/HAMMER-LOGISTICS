import { AccountOwnership, Currency, MoneyDirection } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
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
import { Money, Trim } from '../../common/validation';

/** Only bank accounts are added: the two cash boxes exist from the start. */
export class CreateBankAccountDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  bankName!: string;

  @Trim()
  @Matches(/^[A-Za-z0-9-]{4,34}$/, {
    message: 'رقم الحساب من 4 لـ 34 حرف أو رقم (ممكن IBAN)',
  })
  accountNumber!: string;

  @IsEnum(Currency)
  currency!: Currency;

  @Money()
  openingBalance!: number;

  /** PERSONAL: an owner's own account, a payment channel (no balance, opening 0). */
  @IsOptional()
  @IsEnum(AccountOwnership)
  ownership?: AccountOwnership;

  /** The owner of a personal account (an internal party of kind OWNER). */
  @IsOptional()
  @IsInt()
  @Min(1)
  ownerPartyId?: number;
}

export class UpdateAccountDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @Trim()
  @Matches(/^[A-Za-z0-9-]{4,34}$/, {
    message: 'رقم الحساب من 4 لـ 34 حرف أو رقم (ممكن IBAN)',
  })
  accountNumber?: string;

  /** Changeable only while the account has no movements. */
  @IsOptional()
  @Money()
  openingBalance?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class LedgerQueryDto extends ListQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  /** Only what came in, or only what went out. */
  @IsOptional()
  @IsEnum(MoneyDirection)
  direction?: MoneyDirection;
}
