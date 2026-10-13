import { Expose, Type } from 'class-transformer';
import { IsUUID, IsBoolean, IsArray, ArrayMinSize, ArrayUnique, ValidateNested } from 'class-validator';
import { StoreOfferInputCommand } from './store-offer-input.command';

export class CreateStoreProductCommand {
  @Expose()
  @IsUUID()
  commandId: string;
  @Expose()
  @IsUUID()
  shopUuid: string;
  @Expose()
  @IsUUID()
  productUuid: string;
  @Expose()
  @IsBoolean()
  showing: boolean;
  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((offer) => offer.variantUuid)
  @ValidateNested({ each: true })
  @Type(() => StoreOfferInputCommand)
  offers: StoreOfferInputCommand[];
}
