import { Expose, Type, Transform } from 'class-transformer';
import { IsUUID, IsString, IsOptional, IsArray, ValidateNested, MinLength, MaxLength } from 'class-validator';
import { RecordClarificationCommand } from './record-clarification.command';

export class AccountingRecordInputCommand {
  @Expose()
  @IsOptional()
  @IsUUID()
  uuid?: string;
  @Expose()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  article?: string;
  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecordClarificationCommand)
  clarifications?: RecordClarificationCommand[];
}
