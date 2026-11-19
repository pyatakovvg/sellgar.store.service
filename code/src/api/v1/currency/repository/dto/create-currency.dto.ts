import { Expose } from 'class-transformer';
import { IsNumber, IsString } from 'class-validator';

export class CreateCurrencyDto {
  @Expose()
  @IsString()
  code: string;

  @Expose()
  @IsString()
  value: string;

  @Expose()
  @IsNumber()
  order: number;
}
