import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { Money, NATIONAL_ID, Trim } from '../../common/validation';

/** Fee prices (the whole clearers module is CEO-only). */
export class ClearerPricesDto {
  @Money()
  importFinalBase!: number;

  @Money()
  importTemporaryBase!: number;

  @Money()
  importExtraContainer!: number;

  @Money()
  exportBase!: number;

  @Money()
  exportExtraContainer!: number;
}

export class CreateClearerDto {
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  fullName!: string;

  @Trim()
  @IsString()
  @MaxLength(20)
  phone!: string;

  @Trim()
  @Matches(NATIONAL_ID, { message: 'الرقم القومي لازم يكون 14 رقم' })
  nationalId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  customsOffices?: string[];

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // fee prices: the CEO enters them with the clearer
  @Money()
  importFinalBase!: number;

  @Money()
  importTemporaryBase!: number;

  @Money()
  importExtraContainer!: number;

  @Money()
  exportBase!: number;

  @Money()
  exportExtraContainer!: number;
}

export class UpdateClearerDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @Trim()
  @Matches(NATIONAL_ID, { message: 'الرقم القومي لازم يكون 14 رقم' })
  nationalId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  customsOffices?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ClearersQueryDto extends ListQueryDto {}
