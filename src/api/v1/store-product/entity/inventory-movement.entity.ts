import { Expose, Type } from 'class-transformer';
import { IsUUID, IsDate, IsNumber, IsString, IsOptional } from 'class-validator';

export class InventoryMovementEntity {
  @Expose()
  @IsUUID()
  uuid: string;

  @Expose()
  @IsUUID()
  recordUuid: string;

  @Expose()
  @IsString()
  type: string;

  @Expose()
  @IsNumber()
  quantityDelta: number;

  @Expose()
  @IsNumber()
  reservedDelta: number;

  @Expose()
  @IsString()
  sourceType: string;

  @Expose()
  @IsOptional()
  @IsUUID()
  sourceUuid?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  reason?: string | null;

  @Expose()
  @IsOptional()
  @IsUUID()
  createdBy?: string | null;

  @Expose()
  @IsDate()
  @Type(() => Date)
  createdAt: Date;
}
