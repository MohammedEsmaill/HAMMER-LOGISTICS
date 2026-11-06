import {
  ContainerType,
  CustomsRegime,
  Direction,
  LoadType,
  ShipmentMode,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../common/validation';
import { normaliseContainerNumber } from '../container-number';

/** Bill and booking numbers: trimmed, upper-case, no inner spaces. */
const Reference = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const v = value.trim().toUpperCase().replace(/\s+/g, '');
    return v === '' ? undefined : v;
  });

const Weight = () => {
  const number = IsNumber(
    { maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false },
    { message: 'الوزن لازم يكون رقم (3 أرقام عشرية بالكتير)' },
  );
  const min = Min(0, { message: 'الوزن مينفعش يبقى بالسالب' });
  return (target: object, key: string) => {
    number(target, key);
    min(target, key);
  };
};

export class ContainerDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() !== ''
      ? normaliseContainerNumber(value)
      : undefined,
  )
  @IsString()
  containerNo?: string;

  @IsEnum(ContainerType)
  type!: ContainerType;

  @Weight()
  weight!: number;
}

export class CreateShipmentDto {
  @IsEnum(Direction)
  direction!: Direction;

  @IsEnum(ShipmentMode)
  mode!: ShipmentMode;

  // ── basic data ──
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsInt()
  @Min(1)
  factoryId!: number;

  @IsInt()
  @Min(1)
  clearerId!: number;

  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  foreignPartyName!: string;

  @IsInt()
  @Min(1)
  countryId!: number;

  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  consignee!: string;

  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  commodity!: string;

  @IsOptional()
  @IsEnum(CustomsRegime)
  customsRegime?: CustomsRegime;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  notificationDate?: Date;

  @IsInt()
  @Min(1)
  packagesCount!: number;

  /** Sent for air and free zone; for sea it is the sum of the containers. */
  @IsOptional()
  @Weight()
  totalWeight?: number;

  // ── shipping ──
  @IsOptional()
  @IsInt()
  @Min(1)
  carrierId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  loadingPortId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dischargePortId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  freeZoneId?: number;

  @IsOptional()
  @Trim()
  @Matches(/^[0-9]{19}$/, { message: 'الرقم التعريفي لازم يكون 19 رقم' })
  referenceNumber?: string;

  @IsOptional()
  @Reference()
  @IsString()
  @MaxLength(40)
  hblNumber?: string;

  @IsOptional()
  @Reference()
  @IsString()
  @MaxLength(40)
  mblNumber?: string;

  @IsOptional()
  @Reference()
  @IsString()
  @MaxLength(40)
  voyageNo?: string;

  @IsOptional()
  @Reference()
  @IsString()
  @MaxLength(40)
  bookingNo?: string;

  @IsOptional()
  @IsEnum(LoadType)
  loadType?: LoadType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'الحد الأقصى 10 حاويات' })
  @ValidateNested({ each: true })
  @Type(() => ContainerDto)
  containers?: ContainerDto[];

  // ── operation (optional at registration) ──
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  vesselName?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  eta?: Date;
}
