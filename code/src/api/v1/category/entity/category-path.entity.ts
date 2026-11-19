import { Expose, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';

import { CategoryPathItemEntity } from './category-path-item.entity';

export class CategoryPathEntity {
  @Expose()
  @IsUUID()
  categoryUuid: string;

  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CategoryPathItemEntity)
  items: CategoryPathItemEntity[];
}
