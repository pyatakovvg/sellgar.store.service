import { Expose, Type } from 'class-transformer';
import { ValidateNested, IsArray } from 'class-validator';
import { StoreProductEntity } from './store-product.entity';
import { MetaEntity } from './meta.entity';

export class StoreProductResultEntity {
  @Expose()
  @IsArray()
  @ValidateNested()
  @Type(() => StoreProductEntity)
  data: StoreProductEntity[];

  @Expose()
  @ValidateNested()
  @Type(() => MetaEntity)
  meta: MetaEntity;
}
