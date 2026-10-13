import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { StoreProductEntity } from '../entity';
import { StoreProductModel } from '../model/store-product.model';
import { ProductSnapshotModel } from '../model/product-snapshot.model';
import { ShopSnapshotModel } from '../model/shop-snapshot.model';
import { StoreProductStatus } from '../enum/store-product-status.enum';
import { CreateStoreProductCommand } from '../service/command/create-store-product.command';
import { UpdateStoreProductCommand } from '../service/command/update-store-product.command';
import { ArchiveStoreProductCommand } from '../service/command/archive-store-product.command';
import { CommandRequestRepository } from './command-request.repository';
import { StoreOfferRepository } from './store-offer.repository';
import { StoreProductQueryRepository } from './store-product-query.repository';
import { StoreEventRepository } from './store-event.repository';

@Injectable()
export class StoreProductRepository {
  constructor(
    private readonly commands: CommandRequestRepository,
    private readonly offers: StoreOfferRepository,
    private readonly queries: StoreProductQueryRepository,
    private readonly events: StoreEventRepository,
  ) {}
  create(command: CreateStoreProductCommand) {
    return this.commands.execute(command, 'store.product.create', StoreProductEntity, async (manager) => {
      await this.validateSnapshots(manager, command.shopUuid, command.productUuid);
      const uuid = randomUUID();
      await manager.insert(StoreProductModel, {
        uuid,
        shopUuid: command.shopUuid,
        productUuid: command.productUuid,
        showing: command.showing,
      });
      await this.offers.synchronize(manager, uuid, command.productUuid, command.offers);
      return this.complete(manager, uuid, 'store.product.created');
    });
  }
  update(command: UpdateStoreProductCommand) {
    return this.commands.execute(command, 'store.product.update', StoreProductEntity, async (manager) => {
      const current = await manager.findOne(StoreProductModel, {
        where: { uuid: command.uuid },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current || current.version !== command.expectedVersion)
        throw new ConflictException('Store product version conflict');
      await this.validateSnapshots(manager, current.shopUuid, current.productUuid);
      await manager.update(
        StoreProductModel,
        { uuid: current.uuid, version: command.expectedVersion },
        { showing: command.showing ?? current.showing, version: () => 'version + 1' },
      );
      if (command.offers) await this.offers.synchronize(manager, current.uuid, current.productUuid, command.offers);
      return this.complete(manager, current.uuid, 'store.product.updated');
    });
  }
  archive(command: ArchiveStoreProductCommand) {
    return this.commands.execute(command, 'store.product.archive', StoreProductEntity, async (manager) => {
      const result = await manager.update(
        StoreProductModel,
        { uuid: command.uuid, version: command.expectedVersion },
        { status: StoreProductStatus.ARCHIVED, version: () => 'version + 1' },
      );
      if (result.affected !== 1) throw new ConflictException('Store product version conflict');
      return this.complete(manager, command.uuid, 'store.product.archived');
    });
  }
  private async complete(manager: EntityManager, uuid: string, eventType: string) {
    const result = await this.queries.getByUuid(uuid, manager);
    await this.events.add(manager, 'store_product', uuid, result.version, eventType, result);
    return result;
  }
  private async validateSnapshots(manager: EntityManager, shopUuid: string, productUuid: string) {
    const shop = await manager.findOneBy(ShopSnapshotModel, { shopUuid });
    if (!shop) throw new BadRequestException('Shop snapshot is missing');
    const product = await manager.findOne(ProductSnapshotModel, {
      where: { productUuid },
      lock: { mode: 'pessimistic_read' },
    });
    if (!product || product.sourceProducer !== 'product_srv_v2' || product.status !== 'active')
      throw new BadRequestException('Product v2 snapshot is missing or archived');
  }
}
