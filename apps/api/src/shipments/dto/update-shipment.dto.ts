import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../common/validation';
import { CreateShipmentDto } from './create-shipment.dto';

/** Every edit carries the version it was made on; a stale version is refused (409). */
export class VersionedDto {
  @IsInt()
  @Min(0)
  version!: number;
}

/**
 * SCAN's edit of the basic data, shipping data and containers. Only sent fields
 * change; null clears an optional field. The type (direction / mode) never changes.
 * Sending containers replaces the whole list.
 */
export class UpdateBasicDto extends PartialType(
  OmitType(CreateShipmentDto, ['direction', 'mode', 'vesselName', 'eta']),
) {
  @IsInt()
  @Min(0)
  version!: number;
}

export class UpdateOperationDto extends VersionedDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  vesselName?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  eta?: Date | null;
}

export class ReassignDto extends VersionedDto {
  @IsInt()
  @Min(1)
  operationEmployeeId!: number;
}
