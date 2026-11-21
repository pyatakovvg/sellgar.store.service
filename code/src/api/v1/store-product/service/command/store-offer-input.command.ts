import { Expose, Type } from 'class-transformer';
import { IsUUID, IsOptional, IsBoolean, IsArray, ArrayMinSize, ValidateNested, IsEmpty } from 'class-validator';
import { AccountingRecordInputCommand } from './accounting-record-input.command';

export class StoreOfferInputCommand {
  // Reject the former wire field explicitly rather than silently accepting an old editor.
  @Expose()
  @IsEmpty({ message: 'Price belongs to an accounting record' })
  currentPrice?: never;

  @Expose()
  @IsOptional()
  @IsUUID()
  uuid?: string;
  @Expose()
  @IsUUID()
  variantUuid: string;
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
