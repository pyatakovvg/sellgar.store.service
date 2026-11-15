import { Expose, Type } from 'class-transformer';
import { ValidateNested, IsArray } from 'class-validator';
import { CategoryPathEntity } from '../../category/entity/category-path.entity';
import { StorefrontOfferEntity } from './storefront-offer.entity';

export class StorefrontOfferDetailEntity {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryPathEntity)
  categories: CategoryPathEntity[];

  @Expose()
  @ValidateNested()
  @Type(() => StorefrontOfferEntity)
  offer: StorefrontOfferEntity;

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StorefrontOfferEntity)
  siblingOffers: StorefrontOfferEntity[];
}
