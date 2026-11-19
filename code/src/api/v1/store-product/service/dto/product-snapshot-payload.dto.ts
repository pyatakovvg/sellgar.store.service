import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

import { ProductSnapshotVariantDto } from './product-snapshot-variant.dto';

export class ProductSnapshotPayloadDto {
  @IsUUID()
  uuid: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  name: string;

  @IsIn(['active', 'archived'])
  status: 'active' | 'archived';

  @IsInt()
  @Min(1)
  version: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSnapshotVariantDto)
  variants: ProductSnapshotVariantDto[];
}
