import { Expose, Type } from 'class-transformer';
import {
  IsUUID,
  IsDate,
  ValidateNested,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  ArrayMinSize,
} from 'class-validator';
import { ShopSnapshotEntity } from './shop-snapshot.entity';
import { ProductSnapshotEntity } from './product-snapshot.entity';
import { StoreOfferEntity } from './store-offer.entity';
import { StoreProductStatus } from '../enum/store-product-status.enum';

export class StoreProductEntity {
  @Expose()
  @IsUUID()
  uuid: string;

  @Expose()
  @IsNumber()
  version: number;

  @Expose()
  @IsUUID()
  shopUuid: string;

  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => ShopSnapshotEntity)
  shopSnapshot?: ShopSnapshotEntity | null;

  @Expose()
  @IsUUID()
  productUuid: string;

  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductSnapshotEntity)
  productSnapshot?: ProductSnapshotEntity | null;

  @Expose()
  @IsEnum(StoreProductStatus)
  status: StoreProductStatus;

  @Expose()
  @IsBoolean()
  showing: boolean;

  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested()
  @Type(() => StoreOfferEntity)
  offers: StoreOfferEntity[];

  @Expose()
  @IsDate()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @IsDate()
  @Type(() => Date)
  updatedAt: Date;
}
