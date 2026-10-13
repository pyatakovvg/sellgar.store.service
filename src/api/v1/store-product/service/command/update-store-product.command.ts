import { Expose, Type } from 'class-transformer';
import {
  IsUUID,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  ArrayUnique,
  ValidateNested,
  Min,
} from 'class-validator';
import { StoreOfferInputCommand } from './store-offer-input.command';

export class UpdateStoreProductCommand {
  @Expose()
  @IsUUID()
  commandId: string;
  @Expose()
  @IsUUID()
  uuid: string;
  @Expose()
  @IsInt()
  @Min(1)
  expectedVersion: number;
  @Expose()
  @IsOptional()
  @IsBoolean()
  showing?: boolean;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((offer) => offer.variantUuid)
  @ValidateNested({ each: true })
  @Type(() => StoreOfferInputCommand)
  offers?: StoreOfferInputCommand[];
}
