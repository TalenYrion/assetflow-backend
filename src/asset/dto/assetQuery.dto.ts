import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, length } from 'class-validator';

export class AssetQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  extension?: string;
}
