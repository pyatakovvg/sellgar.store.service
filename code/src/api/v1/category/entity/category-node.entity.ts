import { Expose, Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';

import { CategoryEntity } from './category.entity';

export class CategoryNodeEntity extends CategoryEntity {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryNodeEntity)
  children: CategoryNodeEntity[];
}
