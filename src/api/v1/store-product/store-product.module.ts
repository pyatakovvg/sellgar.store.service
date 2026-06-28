import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommandRequestModel } from './command-request.model';
import { InboxEventModel } from './inbox-event.model';
import { InventoryMovementModel } from './inventory-movement.model';
import { OfferInventoryModel } from './offer-inventory.model';
import { OutboxEventModel } from './outbox-event.model';
import { PriceHistoryModel } from './price-history.model';
import { ProductSnapshotModel } from './product-snapshot.model';
import { ShopSnapshotModel } from './shop-snapshot.model';
import { SnapshotEventController } from './controller/snapshot-event.controller';
import { StoreProductController } from './controller/store-product.controller';
import { StoreProductModel } from './store-product.model';
import { StoreProductRepository } from './repository/store-product.repository';
import { SnapshotEventService } from './service/snapshot-event.service';
import { StoreProductService } from './service/store-product.service';
import { StoreOfferModel } from './store-offer.model';
import { SyncIssueModel } from './sync-issue.model';
import { VariantSnapshotModel } from './variant-snapshot.model';

@Module({
  imports: [
    TypeOrmModule.forFeature([StoreProductModel, StoreOfferModel, PriceHistoryModel, OfferInventoryModel, InventoryMovementModel]),
    TypeOrmModule.forFeature([ShopSnapshotModel, ProductSnapshotModel, VariantSnapshotModel]),
    TypeOrmModule.forFeature([OutboxEventModel, InboxEventModel, SyncIssueModel, CommandRequestModel]),
  ],
  controllers: [StoreProductController, SnapshotEventController],
  providers: [StoreProductRepository, StoreProductService, SnapshotEventService],
})
export class StoreProductModule {}
