import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { createHash } from 'node:crypto';
import * as uuid from 'uuid';
import { DataSource, EntityManager } from 'typeorm';
import { validateOrReject } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { CommandRequestModel } from '../command-request.model';
import { ArchiveStoreProductDto } from './dto/archive-store-product.dto';
import { AdjustOfferInventoryDto } from './dto/adjust-offer-inventory.dto';
import { CreateStoreProductDto } from './dto/create-store-product.dto';
import { ReceiptOfferInventoryDto } from './dto/receipt-offer-inventory.dto';
import { StoreOfferDto } from './dto/store-offer.dto';
import { UpdateStoreProductDto } from './dto/update-store-product.dto';
import { WriteOffOfferInventoryDto } from './dto/write-off-offer-inventory.dto';

import { InventoryMovementModel } from '../inventory-movement.model';
import { InventoryMovementSourceType } from '../inventory-movement-source-type.enum';
import { InventoryMovementType } from '../inventory-movement-type.enum';
import { OfferInventoryModel } from '../offer-inventory.model';
import { OutboxEventModel } from '../outbox-event.model';
import { PriceHistoryModel } from '../price-history.model';
import { ProductSnapshotModel } from '../product-snapshot.model';
import { ShopSnapshotModel } from '../shop-snapshot.model';
import { StoreProductEntity } from '../store-product.entity';
import { StoreProductModel } from '../store-product.model';
import { StoreOfferModel } from '../store-offer.model';
import { StoreOfferStatus } from '../store-offer-status.enum';
import { StoreProductStatus } from '../store-product-status.enum';
import { VariantSnapshotModel } from '../variant-snapshot.model';

@Injectable()
export class StoreProductRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  count() {
    return this.dataSource.createQueryBuilder(StoreProductModel, 'storeProduct').getCount();
  }

  async findAllAndCount(query: any) {
    const builder = this.buildStoreProductQuery().orderBy('storeProduct.createdAt', 'DESC');

    if (query?.search) {
      builder.andWhere(
        `storeProduct.article ILIKE :search OR ` +
          `storeProduct.titleOverride ILIKE :search OR ` +
          `offers.article ILIKE :search OR ` +
          `offers.sku ILIKE :search`,
        { search: `%${decodeURI(query.search)}%` },
      );
    }

    const result = await builder.getManyAndCount();

    const resultInstance = result[0].map((entity) => this.toEntity(entity));

    await Promise.all(resultInstance.map((entity) => validateOrReject(entity)));

    return { data: resultInstance, count: result[1] };
  }

  async findByUuid(uuid: string) {
    const result = await this.buildStoreProductQuery()
      .where('storeProduct.uuid = :uuid', { uuid })
      .getOneOrFail();

    const resultInstance = this.toEntity(result);

    await validateOrReject(resultInstance);

    return resultInstance;
  }

  async create(dto: CreateStoreProductDto) {
    const runner = this.dataSource.createQueryRunner();
    const requestHash = this.commandHash(dto);

    await runner.connect();
    await runner.startTransaction();

    try {
      const commandResult = await this.findCompletedCommand(runner.manager, dto.commandId, requestHash);

      if (commandResult) {
        await runner.commitTransaction();
        return commandResult;
      }

      await this.validateSnapshots(runner.manager, dto);

      const storeProductUuid = uuid.v4();

      await runner.manager.insert(StoreProductModel, {
        uuid: storeProductUuid,
        shopUuid: dto.shopUuid,
        productUuid: dto.productUuid,
        article: dto.article,
        titleOverride: dto.titleOverride,
        descriptionOverride: dto.descriptionOverride,
        showing: dto.showing,
      });

      await this.syncOffers(runner.manager, storeProductUuid, dto.productUuid, dto.offers);

      const result = await this.findByUuidWithManager(runner.manager, storeProductUuid);
      const resultInstance = this.toEntity(result);

      await validateOrReject(resultInstance);
      await this.insertCommand(runner.manager, dto.commandId, 'storeProduct.create', requestHash, resultInstance);
      await this.insertOutboxEvent(runner.manager, {
        aggregateUuid: storeProductUuid,
        aggregateVersion: resultInstance.version,
        eventType: 'store.product.created',
        payload: resultInstance,
      });
      await runner.commitTransaction();

      return resultInstance;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async update(dto: UpdateStoreProductDto) {
    const runner = this.dataSource.createQueryRunner();
    const requestHash = this.commandHash(dto);

    await runner.connect();
    await runner.startTransaction();

    try {
      const commandResult = await this.findCompletedCommand(runner.manager, dto.commandId, requestHash);

      if (commandResult) {
        await runner.commitTransaction();
        return commandResult;
      }

      await this.validateSnapshots(runner.manager, dto);

      const updateResult = await runner.manager.update(
        StoreProductModel,
        { uuid: dto.uuid, version: dto.expectedVersion },
        {
          shopUuid: dto.shopUuid,
          productUuid: dto.productUuid,
          article: dto.article,
          titleOverride: dto.titleOverride,
          descriptionOverride: dto.descriptionOverride,
          showing: dto.showing,
          version: () => 'version + 1',
        },
      );

      if (updateResult.affected !== 1) {
        throw new ConflictException('Store product version conflict');
      }

      const existingOfferUuids = dto.offers.map((offer) => offer.uuid).filter(Boolean);

      await runner.manager
        .createQueryBuilder()
        .update(StoreOfferModel)
        .set({
          status: StoreOfferStatus.ARCHIVED,
          version: () => 'version + 1',
        })
        .where('storeProductUuid = :storeProductUuid', { storeProductUuid: dto.uuid })
        .andWhere('status != :archivedStatus', { archivedStatus: StoreOfferStatus.ARCHIVED })
        .andWhere(existingOfferUuids.length > 0 ? 'uuid NOT IN (:...existingOfferUuids)' : '1=1', {
          existingOfferUuids,
        })
        .execute();

      await this.syncOffers(runner.manager, dto.uuid, dto.productUuid, dto.offers);

      const result = await this.findByUuidWithManager(runner.manager, dto.uuid);
      const resultInstance = this.toEntity(result);

      await validateOrReject(resultInstance);
      await this.insertCommand(runner.manager, dto.commandId, 'storeProduct.update', requestHash, resultInstance);
      await this.insertOutboxEvent(runner.manager, {
        aggregateUuid: dto.uuid,
        aggregateVersion: resultInstance.version,
        eventType: 'store.product.updated',
        payload: resultInstance,
      });
      await runner.commitTransaction();

      return resultInstance;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async archive(dto: ArchiveStoreProductDto) {
    const runner = this.dataSource.createQueryRunner();
    const requestHash = this.commandHash(dto);

    await runner.connect();
    await runner.startTransaction();

    try {
      const commandResult = await this.findCompletedCommand(runner.manager, dto.commandId, requestHash);

      if (commandResult) {
        await runner.commitTransaction();
        return commandResult;
      }

      const updateResult = await runner.manager.update(
        StoreProductModel,
        { uuid: dto.uuid, version: dto.expectedVersion },
        {
          status: StoreProductStatus.ARCHIVED,
          version: () => 'version + 1',
        },
      );

      if (updateResult.affected !== 1) {
        throw new ConflictException('Store product version conflict');
      }

      await runner.manager.update(
        StoreOfferModel,
        { storeProductUuid: dto.uuid },
        {
          status: StoreOfferStatus.ARCHIVED,
          version: () => 'version + 1',
        },
      );

      const result = await this.findByUuidWithManager(runner.manager, dto.uuid);
      const resultInstance = this.toEntity(result);

      await validateOrReject(resultInstance);
      await this.insertCommand(runner.manager, dto.commandId, 'storeProduct.archive', requestHash, resultInstance);
      await this.insertOutboxEvent(runner.manager, {
        aggregateUuid: dto.uuid,
        aggregateVersion: resultInstance.version,
        eventType: 'store.product.archived',
        payload: resultInstance,
      });
      await runner.commitTransaction();

      return resultInstance;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  receiptInventory(dto: ReceiptOfferInventoryDto) {
    return this.applyInventoryMovement({
      dto,
      commandType: 'store.inventory.receipt',
      movementType: InventoryMovementType.RECEIPT,
      sourceType: InventoryMovementSourceType.MANUAL,
      quantityDelta: dto.quantity,
      reservedDelta: 0,
    });
  }

  writeOffInventory(dto: WriteOffOfferInventoryDto) {
    return this.applyInventoryMovement({
      dto,
      commandType: 'store.inventory.writeOff',
      movementType: InventoryMovementType.WRITE_OFF,
      sourceType: InventoryMovementSourceType.MANUAL,
      quantityDelta: -dto.quantity,
      reservedDelta: 0,
    });
  }

  async adjustInventory(dto: AdjustOfferInventoryDto) {
    const offerInventory = await this.dataSource.manager.findOne(OfferInventoryModel, {
      where: { offerUuid: dto.offerUuid },
    });

    if (!offerInventory) {
      throw new BadRequestException('Offer inventory is missing');
    }

    return this.applyInventoryMovement({
      dto,
      commandType: 'store.inventory.adjust',
      movementType: InventoryMovementType.ADJUSTMENT,
      sourceType: InventoryMovementSourceType.CORRECTION,
      quantityDelta: dto.quantity - offerInventory.quantity,
      reservedDelta: 0,
    });
  }

  private buildStoreProductQuery(manager: EntityManager = this.dataSource.manager) {
    return manager
      .createQueryBuilder(StoreProductModel, 'storeProduct')
      .leftJoinAndMapOne(
        'storeProduct.shopSnapshot',
        ShopSnapshotModel,
        'shopSnapshot',
        'shopSnapshot.shopUuid = storeProduct.shopUuid',
      )
      .leftJoinAndMapOne(
        'storeProduct.productSnapshot',
        ProductSnapshotModel,
        'productSnapshot',
        'productSnapshot.productUuid = storeProduct.productUuid',
      )
      .leftJoinAndSelect('storeProduct.offers', 'offers')
      .leftJoinAndSelect('offers.variantSnapshot', 'variantSnapshot')
      .leftJoinAndSelect('offers.prices', 'prices')
      .leftJoinAndSelect('prices.currency', 'currency')
      .leftJoinAndMapOne(
        'offers.currentPrice',
        PriceHistoryModel,
        'current_price',
        'current_price.offerUuid = offers.uuid AND current_price.uuid = ' +
          '(SELECT price.uuid FROM price_history price WHERE price.offer_uuid = offers.uuid ORDER BY price.created_at DESC LIMIT 1)',
      )
      .leftJoinAndSelect('current_price.currency', 'current_price_currency')
      .leftJoinAndSelect('offers.inventory', 'inventory')
      .addOrderBy('offers.createdAt', 'ASC')
      .addOrderBy('prices.createdAt', 'DESC');
  }

  private findByUuidWithManager(manager: EntityManager, storeProductUuid: string) {
    return this.buildStoreProductQuery(manager)
      .where('storeProduct.uuid = :uuid', { uuid: storeProductUuid })
      .getOneOrFail();
  }

  private async syncOffers(manager: EntityManager, storeProductUuid: string, productUuid: string, offers: StoreOfferDto[]) {
    for (const offer of offers) {
      const offerUuid = offer.uuid ?? uuid.v4();
      const priceValue = this.normalizePriceValue(offer.currentPrice.value);

      await manager.upsert(
        StoreOfferModel,
        [
          {
            uuid: offerUuid,
            storeProductUuid,
            productUuid,
            variantUuid: offer.variantUuid,
            sku: offer.sku,
            article: offer.article,
            titleOverride: offer.titleOverride,
            descriptionOverride: offer.descriptionOverride,
            showing: offer.showing,
            version: offer.uuid ? () => 'version + 1' : 1,
          },
        ],
        ['uuid'],
      );

      const currentPrice = await manager
        .createQueryBuilder(PriceHistoryModel, 'price')
        .where('price.offerUuid = :offerUuid', { offerUuid })
        .orderBy('price.createdAt', 'DESC')
        .getOne();

      if (
        !currentPrice ||
        currentPrice.value !== priceValue ||
        currentPrice.currencyCode !== offer.currentPrice.currencyCode
      ) {
        await manager.insert(PriceHistoryModel, {
          offerUuid,
          value: priceValue,
          currencyCode: offer.currentPrice.currencyCode,
        });
      }

      const inventoryExists = await manager.existsBy(OfferInventoryModel, { offerUuid });

      if (!inventoryExists) {
        await manager.insert(OfferInventoryModel, {
          offerUuid,
          quantity: 0,
          reserved: 0,
        });
      }
    }
  }

  private async applyInventoryMovement(params: {
    dto: ReceiptOfferInventoryDto | WriteOffOfferInventoryDto | AdjustOfferInventoryDto;
    commandType: string;
    movementType: InventoryMovementType;
    sourceType: InventoryMovementSourceType;
    quantityDelta: number;
    reservedDelta: number;
  }) {
    const runner = this.dataSource.createQueryRunner();
    const requestHash = this.commandHash(params.dto);

    await runner.connect();
    await runner.startTransaction();

    try {
      const commandResult = await this.findCompletedInventoryCommand(runner.manager, params.dto.commandId, requestHash);

      if (commandResult) {
        await runner.commitTransaction();
        return commandResult;
      }

      const inventory = await runner.manager.findOne(OfferInventoryModel, {
        where: { offerUuid: params.dto.offerUuid },
      });

      if (!inventory) {
        throw new BadRequestException('Offer inventory is missing');
      }

      const quantity = inventory.quantity + params.quantityDelta;
      const reserved = inventory.reserved + params.reservedDelta;

      if (quantity < 0 || reserved < 0 || reserved > quantity) {
        throw new BadRequestException('Inventory movement creates invalid stock state');
      }

      const updateResult = await runner.manager.update(
        OfferInventoryModel,
        { uuid: inventory.uuid, version: params.dto.expectedVersion },
        {
          quantity,
          reserved,
          version: () => 'version + 1',
        },
      );

      if (updateResult.affected !== 1) {
        throw new ConflictException('Offer inventory version conflict');
      }

      await runner.manager.insert(InventoryMovementModel, {
        offerUuid: params.dto.offerUuid,
        type: params.movementType,
        quantityDelta: params.quantityDelta,
        reservedDelta: params.reservedDelta,
        sourceType: params.sourceType,
        sourceUuid: params.dto.sourceUuid,
        reason: params.dto.reason,
        createdBy: params.dto.createdBy,
      });

      const result = await runner.manager.findOneOrFail(OfferInventoryModel, {
        where: { uuid: inventory.uuid },
      });

      await this.insertInventoryCommand(runner.manager, params.dto.commandId, params.commandType, requestHash, result);
      await runner.commitTransaction();

      return result;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  private normalizePriceValue(value: string) {
    const [integer, fraction = ''] = value.split('.');

    return `${integer}.${fraction.padEnd(2, '0').slice(0, 2)}`;
  }

  private toEntity(entity: StoreProductModel) {
    return plainToInstance(StoreProductEntity, entity, {
      strategy: 'excludeAll',
    });
  }

  private async validateSnapshots(manager: EntityManager, dto: CreateStoreProductDto) {
    const shop = await manager.findOne(ShopSnapshotModel, { where: { shopUuid: dto.shopUuid } });

    if (!shop || shop.status !== 'active') {
      throw new BadRequestException('Shop snapshot is missing or inactive');
    }

    const product = await manager.findOne(ProductSnapshotModel, { where: { productUuid: dto.productUuid } });

    if (!product || product.status !== 'active') {
      throw new BadRequestException('Product snapshot is missing or inactive');
    }

    for (const offer of dto.offers) {
      const variant = await manager.findOne(VariantSnapshotModel, { where: { variantUuid: offer.variantUuid } });

      if (!variant || variant.status !== 'active') {
        throw new BadRequestException('Variant snapshot is missing or inactive');
      }

      if (variant.productUuid !== dto.productUuid) {
        throw new BadRequestException('Variant does not belong to product snapshot');
      }
    }
  }

  private async findCompletedCommand(manager: EntityManager, commandId: string, requestHash: string) {
    const command = await manager.findOne(CommandRequestModel, { where: { commandId } });

    if (!command) {
      return null;
    }

    if (command.requestHash !== requestHash) {
      throw new ConflictException('Command id was already used with different payload');
    }

    if (command.status !== 'completed' || !command.result) {
      throw new ConflictException('Command is not completed');
    }

    const resultInstance = plainToInstance(StoreProductEntity, command.result, {
      strategy: 'excludeAll',
    });

    await validateOrReject(resultInstance);

    return resultInstance;
  }

  private async findCompletedInventoryCommand(manager: EntityManager, commandId: string, requestHash: string) {
    const command = await manager.findOne(CommandRequestModel, { where: { commandId } });

    if (!command) {
      return null;
    }

    if (command.requestHash !== requestHash) {
      throw new ConflictException('Command id was already used with different payload');
    }

    if (command.status !== 'completed' || !command.result) {
      throw new ConflictException('Command is not completed');
    }

    const resultInstance = plainToInstance(OfferInventoryModel, command.result);

    return resultInstance;
  }

  private insertCommand(
    manager: EntityManager,
    commandId: string,
    commandType: string,
    requestHash: string,
    result: StoreProductEntity,
  ) {
    return manager.insert(CommandRequestModel, {
      commandId,
      commandType,
      requestHash,
      status: 'completed',
      result: result as unknown as Record<string, unknown>,
    });
  }

  private insertInventoryCommand(
    manager: EntityManager,
    commandId: string,
    commandType: string,
    requestHash: string,
    result: OfferInventoryModel,
  ) {
    return manager.insert(CommandRequestModel, {
      commandId,
      commandType,
      requestHash,
      status: 'completed',
      result: result as unknown as Record<string, unknown>,
    });
  }

  private insertOutboxEvent(
    manager: EntityManager,
    params: {
      aggregateUuid: string;
      aggregateVersion: number;
      eventType: string;
      payload: StoreProductEntity;
    },
  ) {
    return manager.insert(OutboxEventModel, {
      uuid: uuid.v4(),
      producer: 'store_srv',
      aggregateType: 'store_product',
      aggregateUuid: params.aggregateUuid,
      aggregateVersion: params.aggregateVersion,
      eventType: params.eventType,
      schemaVersion: 1,
      payload: params.payload as unknown as Record<string, unknown>,
      status: 'pending',
      attempts: 0,
    });
  }

  private commandHash(
    dto:
      | CreateStoreProductDto
      | UpdateStoreProductDto
      | ArchiveStoreProductDto
      | ReceiptOfferInventoryDto
      | WriteOffOfferInventoryDto
      | AdjustOfferInventoryDto,
  ) {
    return createHash('sha256').update(JSON.stringify(this.sortKeys(dto))).digest('hex');
  }

  private sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortKeys(item));
    }

    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = this.sortKeys((value as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }

    return value;
  }
}
