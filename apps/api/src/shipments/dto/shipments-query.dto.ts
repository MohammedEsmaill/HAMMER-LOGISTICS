import { Direction, ShipmentMode, ShipmentStage } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class ShipmentsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(Direction)
  direction?: Direction;

  @IsOptional()
  @IsEnum(ShipmentMode)
  mode?: ShipmentMode;

  @IsOptional()
  @IsEnum(ShipmentStage)
  stage?: ShipmentStage;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clientId?: number;
}
