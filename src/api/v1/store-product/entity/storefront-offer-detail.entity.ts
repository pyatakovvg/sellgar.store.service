import { Expose, Type } from 'class-transformer';
import { ValidateNested, IsArray } from 'class-validator';
import { StorefrontOfferEntity } from './storefront-offer.entity';

export class StorefrontOfferDetailEntity {
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
