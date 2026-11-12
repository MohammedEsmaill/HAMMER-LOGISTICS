import { CustomsRegime } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/validation';
import { PositiveMoney } from '../money';

export class UpdateFeeRateDto {
  @PositiveMoney()
  firstContainer!: number;

  @PositiveMoney()
  extraContainer!: number;
}

export class RegimeParam {
  @IsEnum(CustomsRegime)
  regime!: CustomsRegime;
}

export class CreateSettlementItemDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: 'اكتب اسم البند' })
  @MaxLength(100)
  name!: string;

  @PositiveMoney()
  price!: number;

  /** The price is per container: the item comes to price × the shipment's containers. */
  @IsOptional()
  @IsBoolean()
  perContainer?: boolean;
}

export class UpdateSettlementItemDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2, { message: 'اكتب اسم البند' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @PositiveMoney()
  price?: number;

  @IsOptional()
  @IsBoolean()
  perContainer?: boolean;

  /** A stopped item is no longer offered; custodies already settled with it keep it. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
