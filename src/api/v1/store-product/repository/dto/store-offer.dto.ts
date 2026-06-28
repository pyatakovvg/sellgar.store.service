import { Type, Expose } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

import { PriceDto } from './price.dto';

export class StoreOfferDto {
  @Expose()
  @IsOptional()
  @IsUUID()
  uuid?: string;

  @Expose()
  @IsUUID()
  variantUuid: string;

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
  @ValidateNested()
  @Type(() => PriceDto)
  currentPrice: PriceDto;

  @Expose()
  @IsNumber()
  quantity: number;

  @Expose()
  @IsOptional()
  @IsNumber()
  reserved?: number;

  @Expose()
  @IsBoolean()
  showing: boolean;
}
