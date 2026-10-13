import { CommandFactory } from './service/command/command.factory';
import { StoreEventRepository } from './repository/store-event.repository';
import { CommandRequestRepository } from './repository/command-request.repository';
import { InventoryRepository } from './repository/inventory.repository';
import { StoreProductQueryRepository } from './repository/store-product-query.repository';
import { StoreOfferRepository } from './repository/store-offer.repository';
import { AccountingRecordRepository } from './repository/accounting-record.repository';
import { CatalogSyncService } from './service/catalog-sync.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountingRecordModel } from './model/accounting-record.model';
import { RecordClarificationModel } from './model/record-clarification.model';
import { CommandRequestModel } from './model/command-request.model';
import { InboxEventModel } from './model/inbox-event.model';
import { InventoryMovementModel } from './model/inventory-movement.model';
import { RecordInventoryModel } from './model/record-inventory.model';
import { OutboxEventModel } from './model/outbox-event.model';
import { PriceHistoryModel } from './model/price-history.model';
import { ProductSnapshotModel } from './model/product-snapshot.model';
import { ShopSnapshotModel } from './model/shop-snapshot.model';
import { SnapshotEventController } from './controller/snapshot-event.controller';
import { StoreProductController } from './controller/store-product.controller';
import { StoreProductModel } from './model/store-product.model';
import { StoreProductRepository } from './repository/store-product.repository';
import { OutboxRepository } from './repository/outbox.repository';
import { OutboxRelayService } from './service/outbox-relay.service';
import { SnapshotEventService } from './service/snapshot-event.service';
import { StoreProductService } from './service/store-product.service';
import { StoreOfferModel } from './model/store-offer.model';
import { SyncIssueModel } from './model/sync-issue.model';
import { VariantSnapshotModel } from './model/variant-snapshot.model';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoreProductModel,
      StoreOfferModel,
      PriceHistoryModel,
      RecordInventoryModel,
      InventoryMovementModel,
      AccountingRecordModel,
      RecordClarificationModel,
    ]),
    TypeOrmModule.forFeature([ShopSnapshotModel, ProductSnapshotModel, VariantSnapshotModel]),
    TypeOrmModule.forFeature([OutboxEventModel, InboxEventModel, SyncIssueModel, CommandRequestModel]),
  ],
  controllers: [StoreProductController, SnapshotEventController],
  providers: [
    CatalogSyncService,
    CommandFactory,
    StoreEventRepository,
    CommandRequestRepository,
    InventoryRepository,
    StoreProductQueryRepository,
    StoreOfferRepository,
    AccountingRecordRepository,
    StoreProductRepository,
    StoreProductService,
    SnapshotEventService,
    OutboxRepository,
    OutboxRelayService,
  ],
})
export class StoreProductModule {}
