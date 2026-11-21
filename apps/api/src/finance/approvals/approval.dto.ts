import { ApprovalStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { Trim } from '../../common/validation';
import { APPROVABLE_TYPES } from './approvable';
import type { ApprovableType } from './approvable';

export class ApprovalQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;

  @IsOptional()
  @IsIn(APPROVABLE_TYPES)
  type?: ApprovableType;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  createdBy?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAmount?: number;

  /** Only the documents I recorded. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  mine?: boolean;
}

export class ApprovalActionDto {
  @IsInt()
  @Min(0)
  version!: number;

  /** Required to reject. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BulkApprovalItemDto {
  @IsIn(APPROVABLE_TYPES)
  type!: ApprovableType;

  @IsInt()
  @Min(1)
  id!: number;

  @IsInt()
  @Min(0)
  version!: number;
}

/** Several documents moved one step on at once (each by its own next step). */
export class BulkApprovalDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BulkApprovalItemDto)
  items!: BulkApprovalItemDto[];
}
