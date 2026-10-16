import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { AccountingRecordModel } from '../model/accounting-record.model';
import { plainToInstance } from 'class-transformer';
import { StoreProductModel } from '../model/store-product.model';
import { StoreOfferModel } from '../model/store-offer.model';
import { ShopSnapshotModel } from '../model/shop-snapshot.model';
import { ProductSnapshotModel } from '../model/product-snapshot.model';
import { PriceHistoryModel } from '../model/price-history.model';
import { StoreProductEntity, StorefrontOfferEntity, StorefrontOfferDetailEntity } from '../entity';
import { GetAllStoreProductsCommand } from '../service/command/get-all-store-products.command';

@Injectable()
export class StoreProductQueryRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}
  async getAll(query: GetAllStoreProductsCommand) {
    const builder = this.applyFilters(this.buildStoreProductQuery(), query).addOrderBy(
      'storeProduct.createdAt',
      'DESC',
    );
    const [rows, count] = await builder.getManyAndCount();
    return { data: rows.map((row) => this.toEntity(row)), meta: { totalRows: count } };
  }

  async getByUuid(
    uuid: string,
    query: GetAllStoreProductsCommand = {},
    manager: EntityManager = this.dataSource.manager,
  ): Promise<StoreProductEntity> {
    const row = await this.applyFilters(this.buildStoreProductQuery(manager), query)
      .andWhere('storeProduct.uuid = :uuid', { uuid })
      .getOne();
    if (!row) throw new NotFoundException('Store product not found');
    return this.toEntity(row);
  }

  async getOffers(query: GetAllStoreProductsCommand = {}) {
    const [rows, count] = await this.applyFilters(this.buildStoreOfferQuery(), query)
      .addOrderBy('offer.createdAt', 'DESC')
      .getManyAndCount();
    return { data: rows.map((row) => this.toOfferEntity(row)), meta: { totalRows: count } };
  }

  async getOffer(uuid: string, query: GetAllStoreProductsCommand = {}): Promise<StorefrontOfferDetailEntity> {
    const row = await this.applyFilters(this.buildStoreOfferQuery(), query)
      .andWhere('offer.uuid = :uuid', { uuid })
      .getOne();
    if (!row) throw new NotFoundException('Store variant association not found');
    const siblings = await this.applyFilters(this.buildStoreOfferQuery(), query)
      .andWhere('offer.storeProductUuid = :uuid', { uuid: row.storeProductUuid })
      .addOrderBy('offer.createdAt', 'ASC')
      .getMany();
    return plainToInstance(
      StorefrontOfferDetailEntity,
      { offer: this.toOfferEntity(row), siblingOffers: siblings.map((item) => this.toOfferEntity(item)) },
      { excludeExtraneousValues: true },
    );
  }

  private applyFilters<T extends ObjectLiteral>(builder: SelectQueryBuilder<T>, query: GetAllStoreProductsCommand) {
    const fields = [
      ['shopUuid', 'storeProduct.shopUuid'],
      ['productUuid', 'storeProduct.productUuid'],
      ['productStatus', 'storeProduct.status'],
      ['productShowing', 'storeProduct.showing'],
      ['variantStatus', 'offer.status'],
      ['variantShowing', 'offer.showing'],
    ] as const;
    for (const [field, column] of fields) {
      if (query[field] !== undefined) builder.andWhere(`${column} = :${field}`, { [field]: query[field] });
    }
    this.applyInventoryFilters(builder, query, 'inventory');
    if (query.search) {
      const records = builder
        .subQuery()
        .select('1')
        .from(AccountingRecordModel, 'searchedRecord')
        .leftJoin('searchedRecord.inventory', 'searchedInventory')
        .where('searchedRecord.offerUuid = offer.uuid')
        .andWhere('searchedRecord.search_vector @@ store_search_query(:search)');
      this.applyInventoryFilters(records, query, 'searchedInventory');
      builder.andWhere(`EXISTS ${records.getQuery()}`, { search: query.search });
    }
    return builder;
  }

  private applyInventoryFilters<T extends ObjectLiteral>(
    builder: SelectQueryBuilder<T>,
    query: GetAllStoreProductsCommand,
    alias: string,
  ): void {
    const fields = [
      ['quantity', `${alias}.quantity`],
      ['reserved', `${alias}.reserved`],
      ['available', `(${alias}.quantity - ${alias}.reserved)`],
    ] as const;
    for (const [field, column] of fields) {
      const minimum = `${field}Min` as const;
      const maximum = `${field}Max` as const;
      if (query[minimum] !== undefined) builder.andWhere(`${column} >= :${minimum}`, { [minimum]: query[minimum] });
      if (query[maximum] !== undefined) builder.andWhere(`${column} <= :${maximum}`, { [maximum]: query[maximum] });
    }
  }

  private toEntity(row: StoreProductModel): StoreProductEntity {
    return plainToInstance(StoreProductEntity, row, { excludeExtraneousValues: true });
  }
  private toOfferEntity(row: StoreOfferModel): StorefrontOfferEntity {
    return plainToInstance(
      StorefrontOfferEntity,
      { ...row, shopUuid: row.storeProduct.shopUuid },
      { excludeExtraneousValues: true },
    );
  }
  buildStoreProductQuery(manager: EntityManager = this.dataSource.manager) {
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
      .leftJoinAndSelect('storeProduct.offers', 'offer')
      .leftJoinAndSelect('offer.variantSnapshot', 'variantSnapshot')
      .leftJoinAndSelect('offer.prices', 'prices')
      .leftJoinAndSelect('prices.currency', 'currency')
      .leftJoinAndMapOne(
        'offer.currentPrice',
        PriceHistoryModel,
        'current_price',
        'current_price.offerUuid = offer.uuid AND current_price.uuid = ' +
          '(SELECT price.uuid FROM price_history price WHERE price.offer_uuid = offer.uuid ORDER BY price.created_at DESC, price.uuid DESC LIMIT 1)',
      )
      .leftJoinAndSelect('current_price.currency', 'current_price_currency')
      .leftJoinAndSelect('offer.records', 'records')
      .leftJoinAndSelect('records.clarifications', 'clarifications')
      .leftJoinAndSelect('records.inventory', 'inventory')
      .addOrderBy('records.createdAt', 'ASC')
      .addOrderBy('records.uuid', 'ASC')
      .addOrderBy('clarifications.position', 'ASC')
      .addOrderBy('offer.createdAt', 'ASC')
      .addOrderBy('prices.createdAt', 'DESC');
  }

  buildStoreOfferQuery(manager: EntityManager = this.dataSource.manager) {
    return manager
      .createQueryBuilder(StoreOfferModel, 'offer')
      .innerJoinAndSelect('offer.storeProduct', 'storeProduct')
      .leftJoinAndMapOne(
        'offer.productSnapshot',
        ProductSnapshotModel,
        'productSnapshot',
        'productSnapshot.productUuid = offer.productUuid',
      )
      .leftJoinAndSelect('offer.variantSnapshot', 'variantSnapshot')
      .leftJoinAndMapOne(
        'offer.currentPrice',
        PriceHistoryModel,
        'current_price',
        'current_price.offerUuid = offer.uuid AND current_price.uuid = ' +
          '(SELECT price.uuid FROM price_history price WHERE price.offer_uuid = offer.uuid ORDER BY price.created_at DESC, price.uuid DESC LIMIT 1)',
      )
      .leftJoinAndSelect('current_price.currency', 'current_price_currency')
      .leftJoinAndSelect('offer.records', 'records')
      .leftJoinAndSelect('records.clarifications', 'clarifications')
      .leftJoinAndSelect('records.inventory', 'inventory')
      .addOrderBy('records.createdAt', 'ASC')
      .addOrderBy('records.uuid', 'ASC')
      .addOrderBy('clarifications.position', 'ASC');
  }

  findByUuidWithManager(manager: EntityManager, storeProductUuid: string) {
    return this.buildStoreProductQuery(manager)
      .where('storeProduct.uuid = :uuid', { uuid: storeProductUuid })
      .getOneOrFail();
  }
}
