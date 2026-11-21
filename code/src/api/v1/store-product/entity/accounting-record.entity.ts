import { PriceHistoryEntity } from './price-history.entity';
import { Expose, Type } from 'class-transformer';
import {
  IsUUID,
  IsDate,
  ValidateNested,
  IsNumber,
  IsString,
  IsInt,
  Min,
  IsArray,
  IsDefined,
  IsOptional,
} from 'class-validator';
import { RecordInventoryEntity } from './record-inventory.entity';
import { RecordClarificationEntity } from './record-clarification.entity';

export class AccountingRecordEntity {
  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => PriceHistoryEntity)
  currentPrice: PriceHistoryEntity | null;

  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceHistoryEntity)
  prices?: PriceHistoryEntity[];

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
  @IsInt()
  @Min(0)
  order: number;
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
