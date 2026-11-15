import { Expose } from 'class-transformer';
import { IsDateString, IsInt, IsString, IsUUID, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class CategoryEntity {
  @Expose()
  @IsUUID()
  uuid: string;

  @Expose()
  @IsInt()
  @Min(1)
  version: number;

  @Expose()
  @IsUUID()
  shopUuid: string;

  @Expose()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  parentUuid: string | null;

  @Expose()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  name: string;

  @Expose()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  description: string | null;

  @Expose()
  @IsInt()
  @Min(0)
  sortOrder: number;

  @Expose()
  @IsDateString()
  createdAt: string;

  @Expose()
  @IsDateString()
  updatedAt: string;
}
