import { Expose } from 'class-transformer';
import { IsNumber, IsUUID } from 'class-validator';

import { CreateStoreProductDto } from './create-store-product.dto';

export class UpdateStoreProductDto extends CreateStoreProductDto {
  @Expose()
  @IsUUID()
  uuid: string;

  @Expose()
  @IsNumber()
  expectedVersion: number;
}
