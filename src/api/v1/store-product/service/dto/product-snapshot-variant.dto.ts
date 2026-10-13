import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ProductSnapshotVariantDto {
  @IsOptional()
  @IsUUID()
  productUuid?: string;
  @IsUUID()
  uuid: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  name: string;

  @IsIn(['active', 'archived'])
  status: 'active' | 'archived';
}
