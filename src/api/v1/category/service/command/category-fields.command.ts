import { Expose, Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CategoryFieldsCommand {
  @Expose()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  parentUuid: string | null;

  @Expose()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  name: string;

  @Expose()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  description: string | null;
}
