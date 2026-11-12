import { ShipmentStage } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim, NotFuture } from '../../common/validation';
import { VersionedDto } from './update-shipment.dto';

/** An optional recorded date: today at the latest. */
const DateField = () => {
  const type = Type(() => Date);
  const isDate = IsDate();
  const optional = IsOptional();
  const notFuture = NotFuture();
  return (target: object, key: string) => {
    optional(target, key);
    type(target, key);
    isDate(target, key);
    notFuture(target, key);
  };
};

/**
 * The customs (Nafeza) tab. Only sent fields change; null clears one.
 * Which fields a shipment type has comes from its rules (customsFields).
 */
export class UpdateCustomsDto extends VersionedDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(40)
  certificateNo?: string | null;

  @DateField() certificateDate?: Date | null;
  @DateField() deliveryOrderDate?: Date | null;
  @DateField() form46Date?: Date | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  storageYardId?: number | null;

  @DateField() deliveredToPortDate?: Date | null;
  @DateField() examinationDate?: Date | null;
  @DateField() inspectionDate?: Date | null;
  @DateField() approvalDate?: Date | null;
  @DateField() paymentDate?: Date | null;
  @DateField() releaseDate?: Date | null;
  @DateField() releaseReceivedDate?: Date | null;
  @DateField() shippedDate?: Date | null;
}

export const INSPECTION_RESULTS = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

/** One regulatory inspection request (العرض الرقابي) on a shipment. */
export interface InspectionItem {
  id: string;
  authorityId: number;
  requestedAt: string;
  result: InspectionResult;
  resultDate: string | null;
  notes: string | null;
}

export class AddInspectionDto extends VersionedDto {
  @IsInt()
  @Min(1)
  authorityId!: number;

  @Type(() => Date)
  @IsDate()
  @NotFuture('تاريخ طلب العرض')
  requestedAt!: Date;

  @IsOptional()
  @IsIn(INSPECTION_RESULTS)
  result?: InspectionResult;

  @DateField() resultDate?: Date | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdateInspectionDto extends VersionedDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @NotFuture('تاريخ طلب العرض')
  requestedAt?: Date;

  @IsOptional()
  @IsIn(INSPECTION_RESULTS)
  result?: InspectionResult;

  @DateField() resultDate?: Date | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class VersionQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}

export class MoveStageDto extends VersionedDto {
  @IsEnum(ShipmentStage)
  to!: ShipmentStage;

  /** When it happened, if recorded late; defaults to now and cannot be in the future. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  occurredAt?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
