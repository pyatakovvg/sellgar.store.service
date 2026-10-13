import { Expose, Type } from 'class-transformer';
import { IsUUID, IsDate, IsNumber, IsString } from 'class-validator';

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
  @IsDate()
  @Type(() => Date)
  syncedAt: Date;
}
