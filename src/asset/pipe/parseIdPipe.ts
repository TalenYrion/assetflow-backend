import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

@Injectable()
export class ParseIdPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const val = parseInt(value, 10);

    if (isNaN(val))
      throw new BadRequestException(
        `${metadata.data} must be a numeric string`,
      );

    if (val <= 0)
      throw new BadRequestException(`${metadata.data} must be positive number`);

    return val;
  }
}
