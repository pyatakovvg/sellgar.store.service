import { Expose } from 'class-transformer';
import { IsNumber, IsUUID } from 'class-validator';

export class ArchiveStoreProductDto {
  @Expose()
  @IsUUID()
  commandId: string;

  @Expose()
  @IsUUID()
  uuid: string;

  @Expose()
  @IsNumber()
  expectedVersion: number;
}
