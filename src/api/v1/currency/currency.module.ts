import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CurrencyController } from './controller/currency.controller';
import { CurrencyModel } from './currency.model';
import { CurrencyRepository } from './repository/currency.repository';
import { CurrencyService } from './service/currency.service';

@Module({
  imports: [TypeOrmModule.forFeature([CurrencyModel])],
  controllers: [CurrencyController],
  providers: [CurrencyRepository, CurrencyService],
})
export class CurrencyModule {}
