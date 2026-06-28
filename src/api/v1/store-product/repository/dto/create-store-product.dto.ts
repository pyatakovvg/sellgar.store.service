import { Type, Expose } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

import { OfferDto } from './offer.dto';

export class CreateStoreProductDto {
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
  @IsBoolean()
  showing: boolean;

  @Expose()
  @ValidateNested()
  @Type(() => OfferDto)
  offers: OfferDto[];
}
