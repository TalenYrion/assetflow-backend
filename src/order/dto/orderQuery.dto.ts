import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional } from 'class-validator';

export class OrderQueryDto {
  @IsNumber()
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  page: number;

  @IsNumber()
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @IsOptional()
  limit: number;
}
