import { Expose } from 'class-transformer';
import { IsNumber, IsString } from 'class-validator';

export class RecordClarificationEntity {
  @Expose()
  @IsNumber()
  position: number;
  @Expose()
  @IsString()
  value: string;
}
