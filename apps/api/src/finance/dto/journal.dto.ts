import { Transform, Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, Matches, Min } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export const JOURNAL_TYPES = [
  'TRANSFER',
  'OTHER',
  'SALARY',
  'ADVANCE',
  'EXPENSE',
  'CUSTODY',
  'FEE_PAYMENT',
  'COLLECTION',
] as const;
export type JournalType = (typeof JOURNAL_TYPES)[number];

/** Comma separated in the query string: ?types=EXPENSE,CUSTODY */
const list = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : value;

export class JournalQueryDto extends ListQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @Transform(list)
  @IsIn(JOURNAL_TYPES, { each: true })
  types?: JournalType[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  accountId?: number;

  @IsOptional()
  @IsIn(['EGP', 'USD'])
  currency?: 'EGP' | 'USD';

  @IsOptional()
  @IsIn(['PENDING', 'REVIEWED', 'MANAGER_APPROVED', 'APPROVED', 'REJECTED'])
  status?: string;

  @IsOptional()
  @IsIn(['IN', 'OUT', 'MOVE'])
  flow?: 'IN' | 'OUT' | 'MOVE';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  createdBy?: number;
}

/** The days list: a period, and a file number or a party to look for. */
export class JournalDaysQueryDto extends ListQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class DayParam {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'التاريخ لازم يكون YYYY-MM-DD' })
  date!: string;
}
