import { Expose, Transform } from 'class-transformer';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class RecordClarificationCommand {
  @Expose()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  value: string;
}
