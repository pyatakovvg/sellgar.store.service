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
import { ProductSnapshotEntity } from './product-snapshot.entity';
import { VariantSnapshotEntity } from './variant-snapshot.entity';
import { PriceHistoryEntity } from './price-history.entity';
import { AccountingRecordEntity } from './accounting-record.entity';
import { StoreOfferStatus } from '../enum/store-offer-status.enum';

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
  @Type(() => ProductSnapshotEntity)
  productSnapshot?: ProductSnapshotEntity | null;

  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => VariantSnapshotEntity)
  variantSnapshot?: VariantSnapshotEntity | null;

  @Expose()
  @IsEnum(StoreOfferStatus)
  status: StoreOfferStatus;

  @Expose()
  @IsBoolean()
  showing: boolean;

  @Expose()
  @IsArray()
  @ValidateNested()
  @Type(() => PriceHistoryEntity)
  prices: PriceHistoryEntity[];

  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => PriceHistoryEntity)
  currentPrice?: PriceHistoryEntity | null;

  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AccountingRecordEntity)
  records: AccountingRecordEntity[];

  @Expose()
  @IsDate()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @IsDate()
  @Type(() => Date)
  updatedAt: Date;
}
