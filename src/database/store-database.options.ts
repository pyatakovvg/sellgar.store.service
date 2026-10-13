import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { StoreOfferModel } from '../api/v1/store-product/model/store-offer.model';
import { ProductSnapshotModel } from '../api/v1/store-product/model/product-snapshot.model';
import { RecordClarificationModel } from '../api/v1/store-product/model/record-clarification.model';
import { StoreProductModel } from '../api/v1/store-product/model/store-product.model';
import { RecordInventoryModel } from '../api/v1/store-product/model/record-inventory.model';
import { VariantSnapshotModel } from '../api/v1/store-product/model/variant-snapshot.model';
import { CommandRequestModel } from '../api/v1/store-product/model/command-request.model';
import { AccountingRecordModel } from '../api/v1/store-product/model/accounting-record.model';
import { InventoryMovementModel } from '../api/v1/store-product/model/inventory-movement.model';
import { PriceHistoryModel } from '../api/v1/store-product/model/price-history.model';
import { OutboxEventModel } from '../api/v1/store-product/model/outbox-event.model';
import { InboxEventModel } from '../api/v1/store-product/model/inbox-event.model';
import { SyncIssueModel } from '../api/v1/store-product/model/sync-issue.model';
import { ShopSnapshotModel } from '../api/v1/store-product/model/shop-snapshot.model';
import { CurrencyModel } from '../api/v1/currency/currency.model';

export class StoreDatabaseOptions {
  static create(env: NodeJS.ProcessEnv): DataSourceOptions {
    const schema = env.STORE_DATABASE_SCHEMA ?? 'public';
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Invalid STORE_DATABASE_SCHEMA');
    return {
      type: 'postgres',
      installExtensions: false,
      host: this.required(env, 'DATABASE_HOST'),
      port: Number(env.DATABASE_PORT ?? 5432),
      username: this.required(env, 'DATABASE_USERNAME'),
      password: this.required(env, 'DATABASE_PASSWORD'),
      database: this.required(env, 'DATABASE_DATABASE_NAME'),
      schema,
      extra: { options: `-c search_path=${schema},public` },
      entities: [
        StoreOfferModel,
        ProductSnapshotModel,
        RecordClarificationModel,
        StoreProductModel,
        RecordInventoryModel,
        VariantSnapshotModel,
        CommandRequestModel,
        AccountingRecordModel,
        InventoryMovementModel,
        PriceHistoryModel,
        OutboxEventModel,
        InboxEventModel,
        SyncIssueModel,
        ShopSnapshotModel,
        CurrencyModel,
      ],
      migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
      synchronize: false,
      migrationsRun: false,
      dropSchema: false,
    };
  }
  private static required(env: NodeJS.ProcessEnv, key: string): string {
    const value = env[key];
    if (!value) throw new Error(`Missing configuration: ${key}`);
    return value;
  }
}
