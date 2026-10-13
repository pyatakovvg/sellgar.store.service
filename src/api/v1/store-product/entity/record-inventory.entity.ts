import { Expose, Transform, Type } from 'class-transformer';
import { IsUUID, IsDate, IsNumber } from 'class-validator';

export class RecordInventoryEntity {
  @Expose()
  @IsUUID()
  uuid: string;

  @Expose()
  @IsUUID()
  recordUuid: string;

  @Expose()
  @IsNumber()
  quantity: number;

  @Expose()
  @IsNumber()
  reserved: number;

  @Expose()
  @Transform(({ obj }) => obj.quantity - obj.reserved, { toClassOnly: true })
  @IsNumber()
  available: number;

  @Expose()
  @IsNumber()
  version: number;

  @Expose()
  @IsDate()
  @Type(() => Date)
  updatedAt: Date;
}
