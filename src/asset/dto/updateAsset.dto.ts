import { PartialType } from '@nestjs/mapped-types';
import { CreateAssetDto } from './createAsset.dto';

export class UpdateAssetDto extends PartialType(CreateAssetDto) {}
