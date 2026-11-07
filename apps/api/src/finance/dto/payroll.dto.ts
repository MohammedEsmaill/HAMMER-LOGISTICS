import { ApprovalStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
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
import { Money, Trim } from '../../common/validation';
import { PositiveMoney } from '../money';

export const ADDITION_KINDS = ['BONUS', 'OVERTIME'] as const;
export const DEDUCTION_KINDS = ['PENALTY', 'ABSENCE'] as const;
export const ADJUSTMENT_KINDS = [
  ...ADDITION_KINDS,
  ...DEDUCTION_KINDS,
] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

const MONTH = /^20[0-9]{2}-(0[1-9]|1[0-2])$/;

/** A bonus / overtime (adds) or a penalty / absence (deducts), always with its reason. */
export class SalaryAdjustmentDto {
  @IsIn(ADJUSTMENT_KINDS)
  kind!: AdjustmentKind;

  @PositiveMoney()
  amount!: number;

  @Trim()
  @IsString()
  @MinLength(3, { message: 'اكتب سبب الزيادة أو الخصم' })
  @MaxLength(300)
  reason!: string;
}

export class CreateSalaryDto {
  @IsInt()
  @Min(1)
  employeeId!: number;

  /** "2026-11" */
  @Matches(MONTH, { message: 'الشهر لازم يكون بالشكل 2026-11' })
  salaryMonth!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SalaryAdjustmentDto)
  adjustments?: SalaryAdjustmentDto[];

  /** Manual, from 0 up to the employee's advance balance. */
  @IsOptional()
  @Money()
  advanceDeduction?: number;

  @IsInt()
  @Min(1)
  accountId!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paymentDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateSalaryDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SalaryAdjustmentDto)
  adjustments?: SalaryAdjustmentDto[];

  @IsOptional()
  @Money()
  advanceDeduction?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  accountId?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paymentDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class SalaryPreviewQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId!: number;

  @Matches(MONTH, { message: 'الشهر لازم يكون بالشكل 2026-11' })
  month!: string;
}

export class SalariesQueryDto extends ListQueryDto {
  @IsOptional()
  @Matches(MONTH, { message: 'الشهر لازم يكون بالشكل 2026-11' })
  month?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId?: number;

  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;
}

export class CreateAdvanceDto {
  @IsInt()
  @Min(1)
  employeeId!: number;

  @PositiveMoney()
  amount!: number;

  @IsInt()
  @Min(1)
  accountId!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  advanceDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateAdvanceDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @PositiveMoney()
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  accountId?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  advanceDate?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class AdvancesQueryDto extends ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId?: number;

  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;
}
