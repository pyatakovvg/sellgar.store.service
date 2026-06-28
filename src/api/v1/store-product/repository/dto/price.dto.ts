import { Expose } from 'class-transformer';
import { IsNumber, IsString } from 'class-validator';

export class PriceDto {
  @Expose()
  @IsNumber()
  value: number;

  @Expose()
  @IsString()
  currencyCode: string;
}
