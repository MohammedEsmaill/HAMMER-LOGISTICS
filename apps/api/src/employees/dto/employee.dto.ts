import { Department, EmployeeStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { Money, NATIONAL_ID, Trim, NotFuture } from '../../common/validation';

export class CreateEmployeeDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code!: string; // the user id on the ZKTeco fingerprint device

  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  fullName!: string;

  @Trim()
  @Matches(NATIONAL_ID, { message: 'الرقم القومي لازم يكون 14 رقم' })
  nationalId!: string;

  @Trim()
  @IsString()
  @MaxLength(20)
  phone!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsEnum(Department)
  department!: Department;

  @Trim()
  @IsString()
  @MaxLength(80)
  jobTitle!: string;

  @Type(() => Date)
  @IsDate()
  @NotFuture('تاريخ التعيين')
  hireDate!: Date;

  @IsOptional()
  @Money()
  basicSalary?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @Trim()
  @Matches(NATIONAL_ID, { message: 'الرقم القومي لازم يكون 14 رقم' })
  nationalId?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsEnum(Department)
  department?: Department;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  jobTitle?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @NotFuture('تاريخ التعيين')
  hireDate?: Date;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @NotFuture('تاريخ ترك العمل')
  leaveDate?: Date;

  @IsOptional()
  @Money()
  basicSalary?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class EmployeesQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(Department)
  department?: Department;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

export class EmployeeOptionsQueryDto {
  @IsOptional()
  @IsEnum(Department)
  department?: Department;
}
