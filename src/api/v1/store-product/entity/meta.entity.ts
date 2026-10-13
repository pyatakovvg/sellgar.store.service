import { Expose } from 'class-transformer';
import { IsNumber } from 'class-validator';

export class MetaEntity {
  @Expose()
  @IsNumber()
  totalRows: number;
}
