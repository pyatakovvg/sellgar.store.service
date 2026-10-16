import { Expose, Transform } from 'class-transformer';
import {
  IsUUID,
  IsString,
  IsOptional,
  MaxLength,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
  Validate,
  ValidateIf,
} from 'class-validator';
import { StoreProductStatus } from '../../enum/store-product-status.enum';
import { StoreOfferStatus } from '../../enum/store-offer-status.enum';
import { RangeMaximumConstraint } from './validation/range-maximum.constraint';

export class GetAllStoreProductsCommand {
  @Expose()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(256)
  search?: string;

  @Expose()
  @IsOptional()
  @IsUUID()
  shopUuid?: string;

  @Expose()
  @IsOptional()
  @IsUUID()
  productUuid?: string;

  @Expose()
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(StoreProductStatus)
  productStatus?: StoreProductStatus;

  @Expose()
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(StoreOfferStatus)
  variantStatus?: StoreOfferStatus;

  @Expose()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  productShowing?: boolean;

  @Expose()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  variantShowing?: boolean;

  @Expose()
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  quantityMin?: number;

  @Expose()
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  @Validate(RangeMaximumConstraint, ['quantityMin'])
  quantityMax?: number;

  @Expose()
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  reservedMin?: number;

  @Expose()
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  @Validate(RangeMaximumConstraint, ['reservedMin'])
  reservedMax?: number;

  @Expose()
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  availableMin?: number;

  @Expose()
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  @Validate(RangeMaximumConstraint, ['availableMin'])
  availableMax?: number;
}
