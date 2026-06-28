import { Module } from '@nestjs/common';

import { CurrencyModule } from './currency/currency.module';
import { StoreProductModule } from './store-product/store-product.module';

@Module({
  imports: [CurrencyModule, StoreProductModule],
})
export class ApiV1Module {}
