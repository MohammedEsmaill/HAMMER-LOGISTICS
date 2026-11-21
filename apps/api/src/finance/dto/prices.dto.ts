import { CustomsRegime } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Money, Trim } from '../../common/validation';
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

export class FactoryPriceDto {
  @IsInt()
  @Min(1)
  settlementItemId!: number;

  @Money()
  price!: number;
}

/** A factory's own prices for the clearer settlement items. */
export class UpdateFactoryPricesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => FactoryPriceDto)
  prices!: FactoryPriceDto[];
}
