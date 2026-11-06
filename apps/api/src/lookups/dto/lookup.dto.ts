import { TransportKind } from '@prisma/client';
import { Transform } from 'class-transformer';
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
import { Trim } from '../../common/validation';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class SearchQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class KindQueryDto extends SearchQueryDto {
  @IsOptional()
  @IsEnum(TransportKind)
  kind?: TransportKind;
}

export class PortsQueryDto extends KindQueryDto {
  /** true = Egyptian ports / airports only, false = the rest of the world. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  egyptian?: boolean;
}

export class NameDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;
}

/** kind is required for carriers and storage yards, ignored for the other lists. */
export class CreateLookupDto extends NameDto {
  @IsOptional()
  @IsEnum(TransportKind)
  kind?: TransportKind;
}

export class CreatePortDto extends NameDto {
  @IsEnum(TransportKind)
  kind!: TransportKind;

  /** UN/LOCODE for sea ports (EGALY), IATA for airports (CAI). */
  @IsOptional()
  @Trim()
  @Matches(/^([A-Z]{2}[A-Z0-9]{3}|[A-Z]{3})$/, {
    message: 'الكود لازم يكون UN/LOCODE (EGALY) أو IATA (CAI)',
  })
  code?: string;

  @IsInt()
  @Min(1)
  countryId!: number;
}

export class UpdatePortDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @Trim()
  @Matches(/^([A-Z]{2}[A-Z0-9]{3}|[A-Z]{3})$/, {
    message: 'الكود لازم يكون UN/LOCODE (EGALY) أو IATA (CAI)',
  })
  code?: string;
}
