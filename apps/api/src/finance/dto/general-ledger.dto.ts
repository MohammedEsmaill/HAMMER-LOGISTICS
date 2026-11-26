import { Currency } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export class TrialBalanceQueryDto {
  @IsEnum(Currency)
  currency!: Currency;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class LedgerQueryDto extends TrialBalanceQueryDto {
  /** The chart key: CUSTODY, MA:3, PARTY:2, EXP:PETTY … */
  @IsString()
  @Matches(/^[A-Z_]+(:[A-Z0-9_]+)?$/)
  account!: string;
}
