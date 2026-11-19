import { Expose, Type } from 'class-transformer';
import { IsUUID, IsDate, ValidateNested, IsString, IsOptional } from 'class-validator';
import { CurrencyEntity } from './currency.entity';

export class PriceHistoryEntity {
  @Expose()
  @IsUUID()
  uuid: string;

  @Expose()
  @IsUUID()
  offerUuid: string;

  @Expose()
  @IsString()
  value: string;

  @Expose()
  @IsString()
  currencyCode: string;

  @Expose()
  @ValidateNested()
  @Type(() => CurrencyEntity)
  currency: CurrencyEntity;

  @Expose()
  @IsDate()
  @Type(() => Date)
  startsAt: Date;

  @Expose()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endsAt?: Date | null;

  @Expose()
  @IsOptional()
  @IsString()
  reason?: string | null;

  @Expose()
  @IsDate()
  @Type(() => Date)
  createdAt: Date;
}
