import { Expose } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

export class PriceDto {
  @Expose()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  value: string;

  @Expose()
  @IsString()
  currencyCode: string;
}
