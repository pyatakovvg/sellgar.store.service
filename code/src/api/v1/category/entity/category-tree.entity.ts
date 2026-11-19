import { Expose, Type } from 'class-transformer';
import { IsArray, IsUUID, ValidateNested } from 'class-validator';

import { CategoryNodeEntity } from './category-node.entity';

export class CategoryTreeEntity {
  @Expose()
  @IsUUID()
  shopUuid: string;

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryNodeEntity)
  nodes: CategoryNodeEntity[];
}
