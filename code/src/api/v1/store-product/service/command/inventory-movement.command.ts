import { Expose } from 'class-transformer';
import { IsUUID, IsString, IsOptional, IsInt, Min, MaxLength } from 'class-validator';

export class InventoryMovementCommand {
  @Expose()
  @IsUUID()
  commandId: string;
  @Expose()
  @IsUUID()
  recordUuid: string;
  @Expose()
  @IsInt()
  @Min(1)
  expectedVersion: number;
  @Expose()
  @IsInt()
  @Min(1)
  quantity: number;
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
  @Expose()
  @IsOptional()
  @IsUUID()
  sourceUuid?: string;
  @Expose()
  @IsOptional()
  @IsUUID()
  createdBy?: string;
}
