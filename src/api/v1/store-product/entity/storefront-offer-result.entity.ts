import { Expose, Type } from 'class-transformer';
import { ValidateNested, IsArray } from 'class-validator';
import { StorefrontOfferEntity } from './storefront-offer.entity';
import { MetaEntity } from './meta.entity';

export class StorefrontOfferResultEntity {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StorefrontOfferEntity)
  data: StorefrontOfferEntity[];

  @Expose()
  @ValidateNested()
  @Type(() => MetaEntity)
  meta: MetaEntity;
}
