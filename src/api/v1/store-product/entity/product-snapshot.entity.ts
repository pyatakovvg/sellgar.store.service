import { Expose, Type } from 'class-transformer';
import { IsUUID, IsDate, IsNumber, IsString } from 'class-validator';

export class ProductSnapshotEntity {
  @Expose()
  @IsString()
  sourceProducer: string;
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
  @Type(() => Date)
  syncedAt: Date;
}
