import { Type, Expose } from 'class-transformer';
import { IsUUID, IsDate, ValidateNested, IsNumber, IsString, IsBoolean, IsOptional, IsEnum } from 'class-validator';

import { StoreOfferStatus } from './store-offer-status.enum';
import { StoreProductStatus } from './store-product-status.enum';

export class CurrencyEntity {
  @Expose()
  @IsString()
  code: string;

  @Expose()
  @IsString()
  value: string;

  @Expose()
  @IsNumber()
  order: number;

  @Expose()
  @IsDate()
  createdAt: Date;

  @Expose()
  @IsDate()
  updatedAt: Date;
}

export class ShopSnapshotEntity {
  @Expose()
  @IsUUID()
  shopUuid: string;

  @Expose()
  @IsNumber()
  sourceVersion: number;

  @Expose()
  @IsString()
  name: string;

  @Expose()
  @IsString()
  status: string;

  @Expose()
  @IsDate()
  syncedAt: Date;
}

export class ProductSnapshotEntity {
  @Expose()
  @IsUUID()
  productUuid: string;

  @Expose()
  @IsNumber()
  sourceVersion: number;

  @Expose()
  @IsString()
  name: string;

  @Expose()
  @IsString()
  status: string;

  @Expose()
  @IsDate()
  syncedAt: Date;
}

export class VariantSnapshotEntity {
  @Expose()
  @IsUUID()
  variantUuid: string;

  @Expose()
  @IsUUID()
  productUuid: string;

  @Expose()
  @IsNumber()
  sourceVersion: number;

  @Expose()
  @IsString()
  name: string;

  @Expose()
  @IsString()
  status: string;

  @Expose()
  @IsDate()
  syncedAt: Date;
}

export class PriceHistoryEntity {
  @Expose()
  @IsUUID()
  uuid: string;

  @Expose()
  @IsUUID()
  offerUuid: string;

  @Expose()
  @IsString()
  value: string;

  @Expose()
  @IsString()
  currencyCode: string;

  @Expose()
  @ValidateNested()
  @Type(() => CurrencyEntity)
  currency: CurrencyEntity;

  @Expose()
  @IsDate()
  startsAt: Date;

  @Expose()
  @IsOptional()
  @IsDate()
  endsAt?: Date | null;

  @Expose()
  @IsOptional()
  @IsString()
  reason?: string | null;

  @Expose()
  @IsDate()
  createdAt: Date;
}

export class InventoryEntity {
  @Expose()
  @IsUUID()
  uuid: string;

  @Expose()
  @IsUUID()
  offerUuid: string;

  @Expose()
  @IsNumber()
  quantity: number;

  @Expose()
  @IsNumber()
  reserved: number;

  @Expose()
  @IsNumber()
  version: number;

  @Expose()
  @IsDate()
  updatedAt: Date;
}

export class StoreOfferEntity {
  @Expose()
  @IsUUID()
  uuid: string;

  @Expose()
  @IsNumber()
  version: number;

  @Expose()
  @IsUUID()
  storeProductUuid: string;

  @Expose()
  @IsUUID()
  productUuid: string;

  @Expose()
  @IsUUID()
  variantUuid: string;

  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => VariantSnapshotEntity)
  variantSnapshot?: VariantSnapshotEntity | null;

  @Expose()
  @IsOptional()
  @IsString()
  sku?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  article?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  titleOverride?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  descriptionOverride?: string | null;

  @Expose()
  @IsEnum(StoreOfferStatus)
  status: StoreOfferStatus;

  @Expose()
  @IsBoolean()
  showing: boolean;

  @Expose()
  @ValidateNested()
  @Type(() => PriceHistoryEntity)
  prices: PriceHistoryEntity[];

  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => PriceHistoryEntity)
  currentPrice?: PriceHistoryEntity | null;

  @Expose()
  @ValidateNested()
  @Type(() => InventoryEntity)
  inventory: InventoryEntity[];

  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => InventoryEntity)
  currentInventory?: InventoryEntity | null;

  @Expose()
  @IsDate()
  createdAt: Date;

  @Expose()
  @IsDate()
  updatedAt: Date;
}

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
  @IsString()
  article: string;

  @Expose()
  @IsOptional()
  @IsString()
  titleOverride?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  descriptionOverride?: string | null;

  @Expose()
  @IsEnum(StoreProductStatus)
  status: StoreProductStatus;

  @Expose()
  @IsBoolean()
  showing: boolean;

  @Expose()
  @ValidateNested()
  @Type(() => StoreOfferEntity)
  offers: StoreOfferEntity[];

  @Expose()
  @IsDate()
  createdAt: Date;

  @Expose()
  @IsDate()
  updatedAt: Date;
}

class MetaEntity {
  @Expose()
  @IsNumber()
  totalRows: number;
}

export class StoreProductResultEntity {
  @Expose()
  @ValidateNested()
  @Type(() => StoreProductEntity)
  data: StoreProductEntity[];

  @Expose()
  @ValidateNested()
  @Type(() => MetaEntity)
  meta: MetaEntity;
}
