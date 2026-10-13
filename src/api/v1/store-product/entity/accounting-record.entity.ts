import { Expose, Type } from 'class-transformer';
import { IsUUID, IsDate, ValidateNested, IsNumber, IsString, IsArray, IsDefined } from 'class-validator';
import { RecordInventoryEntity } from './record-inventory.entity';
import { RecordClarificationEntity } from './record-clarification.entity';

export class AccountingRecordEntity {
  @Expose()
  @IsUUID()
  uuid: string;
  @Expose()
  @IsUUID()
  offerUuid: string;
  @Expose()
  @IsString()
  article: string;
  @Expose()
  @IsNumber()
  version: number;
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecordClarificationEntity)
  clarifications: RecordClarificationEntity[];
  @Expose()
  @IsDefined()
  @ValidateNested()
  @Type(() => RecordInventoryEntity)
  inventory: RecordInventoryEntity;
  @Expose()
  @IsDate()
  @Type(() => Date)
  createdAt: Date;
  @Expose()
  @IsDate()
  @Type(() => Date)
  updatedAt: Date;
}
