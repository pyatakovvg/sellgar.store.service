import { Expose, Transform } from 'class-transformer';
import { IsUUID, IsString, IsOptional, MaxLength } from 'class-validator';

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
}
