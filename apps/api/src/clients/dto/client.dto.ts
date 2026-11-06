import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { EGYPT_MOBILE, Money, TAX_NUMBER, Trim } from '../../common/validation';

export class CreateFactoryDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @Trim()
  @Matches(TAX_NUMBER, { message: 'الرقم الضريبي لازم يكون 9 أرقام' })
  taxNumber!: string;

  @Trim()
  @IsString()
  @MaxLength(50)
  commercialRegister!: string;

  @Trim()
  @IsString()
  @MaxLength(255)
  address!: string;
}

export class UpdateFactoryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @Trim()
  @Matches(TAX_NUMBER, { message: 'الرقم الضريبي لازم يكون 9 أرقام' })
  taxNumber?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  commercialRegister?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255)
  address?: string;
}

export class CreateClientDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @Trim()
  @Matches(EGYPT_MOBILE, { message: 'رقم الموبايل غير صحيح' })
  mobile!: string;

  @Trim()
  @IsEmail({}, { message: 'الإيميل غير صحيح' })
  email!: string;

  @IsInt()
  @Min(1)
  importOperationEmployeeId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  exportOperationEmployeeId?: number | null;

  @Money()
  quoteFinalBase!: number;

  @Money()
  quoteTemporaryBase!: number;

  @Money()
  quoteImportExtraContainer!: number;

  @Money()
  quoteExportBase!: number;

  @Money()
  quoteExportExtraContainer!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateFactoryDto)
  factories?: CreateFactoryDto[];
}

export class UpdateClientDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @Trim()
  @Matches(EGYPT_MOBILE, { message: 'رقم الموبايل غير صحيح' })
  mobile?: string;

  @IsOptional()
  @Trim()
  @IsEmail({}, { message: 'الإيميل غير صحيح' })
  email?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  importOperationEmployeeId?: number;

  /** null removes the export operation employee (export shipments then go to the import one). */
  @IsOptional()
  @IsInt()
  @Min(1)
  exportOperationEmployeeId?: number | null;

  @IsOptional()
  @Money()
  quoteFinalBase?: number;

  @IsOptional()
  @Money()
  quoteTemporaryBase?: number;

  @IsOptional()
  @Money()
  quoteImportExtraContainer?: number;

  @IsOptional()
  @Money()
  quoteExportBase?: number;

  @IsOptional()
  @Money()
  quoteExportExtraContainer?: number;
}

export class ClientsQueryDto extends ListQueryDto {}
