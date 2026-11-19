import { Expose, Type } from 'class-transformer';
import { IsUUID, IsOptional, IsBoolean, IsArray, ArrayMinSize, ValidateNested } from 'class-validator';
import { PriceCommand } from './price.command';
import { AccountingRecordInputCommand } from './accounting-record-input.command';

export class StoreOfferInputCommand {
  @Expose()
  @IsOptional()
  @IsUUID()
  uuid?: string;
  @Expose()
  @IsUUID()
  variantUuid: string;
  @Expose()
  @ValidateNested()
  @Type(() => PriceCommand)
  currentPrice: PriceCommand;
  @Expose()
  @IsBoolean()
  showing: boolean;
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AccountingRecordInputCommand)
  records?: AccountingRecordInputCommand[];
}
