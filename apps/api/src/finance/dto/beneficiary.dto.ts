import { BeneficiaryKind } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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

const AccountNumber = () =>
  Matches(/^[A-Za-z0-9 -]{4,40}$/, {
    message: 'رقم الحساب أو الـ IBAN: من 4 لـ 34 حرف أو رقم',
  });

export class CreateBeneficiaryDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: 'اكتب اسم المستفيد' })
  @MaxLength(150)
  name!: string;

  @IsEnum(BeneficiaryKind)
  kind!: BeneficiaryKind;

  /** kind CLEARER: the clearer whose account it is. */
  @IsOptional()
  @IsInt()
  @Min(1)
  clearerId?: number;

  @Trim()
  @IsString()
  @MinLength(2, { message: 'اكتب اسم البنك' })
  @MaxLength(100)
  bankName!: string;

  @Trim()
  @AccountNumber()
  accountNumber!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateBeneficiaryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @Trim()
  @AccountNumber()
  accountNumber?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class BeneficiariesQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(BeneficiaryKind)
  kind?: BeneficiaryKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clearerId?: number;

  /** false lists the stopped ones too. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  activeOnly?: boolean;
}
