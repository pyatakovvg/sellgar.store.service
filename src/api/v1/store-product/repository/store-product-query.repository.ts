import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { StoreProductModel } from '../model/store-product.model';
import { StoreOfferModel } from '../model/store-offer.model';
import { ShopSnapshotModel } from '../model/shop-snapshot.model';
import { ProductSnapshotModel } from '../model/product-snapshot.model';
import { PriceHistoryModel } from '../model/price-history.model';
import { StoreProductStatus } from '../enum/store-product-status.enum';
import { StoreOfferStatus } from '../enum/store-offer-status.enum';
import { StoreProductEntity, StorefrontOfferEntity, StorefrontOfferDetailEntity } from '../entity';
import { GetAllStoreProductsCommand } from '../service/command/get-all-store-products.command';

@Injectable()
export class StoreProductQueryRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}
  async getAll(query: GetAllStoreProductsCommand) {
    const builder = this.buildStoreProductQuery().addOrderBy('storeProduct.createdAt', 'DESC');
    if (query.shopUuid) builder.andWhere('storeProduct.shopUuid = :shopUuid', { shopUuid: query.shopUuid });
    if (query.productUuid)
      builder.andWhere('storeProduct.productUuid = :productUuid', { productUuid: query.productUuid });
    if (query.search)
      builder.andWhere(
        `(productSnapshot.name ILIKE :search OR EXISTS (
    SELECT 1 FROM store_offer searched_offer
    JOIN variant_snapshot searched_variant ON searched_variant.variant_uuid=searched_offer.variant_uuid
    JOIN accounting_record searched_record ON searched_record.offer_uuid=searched_offer.uuid
    LEFT JOIN record_clarification searched_clarification ON searched_clarification.record_uuid=searched_record.uuid
    WHERE searched_offer.store_product_uuid=storeProduct.uuid AND
    (searched_record.article ILIKE :search OR searched_variant.name ILIKE :search OR searched_clarification.value ILIKE :search)
  ))`,
        { search: `%${query.search}%` },
      );
    const [rows, count] = await builder.getManyAndCount();
    return { data: rows.map((row) => this.toEntity(row)), meta: { totalRows: count } };
  }
  async getByUuid(uuid: string, manager: EntityManager = this.dataSource.manager): Promise<StoreProductEntity> {
    const row = await this.buildStoreProductQuery(manager).where('storeProduct.uuid = :uuid', { uuid }).getOne();
    if (!row) throw new NotFoundException('Store product not found');
    return this.toEntity(row);
  }
  async getOffers() {
    const [rows, count] = await this.buildPublicStoreOfferQuery()
      .addOrderBy('offer.createdAt', 'DESC')
      .getManyAndCount();
    return { data: rows.map((row) => this.toOfferEntity(row)), meta: { totalRows: count } };
  }
  async getOffer(uuid: string): Promise<StorefrontOfferDetailEntity> {
    const row = await this.buildPublicStoreOfferQuery().andWhere('offer.uuid = :uuid', { uuid }).getOne();
    if (!row) throw new NotFoundException('Store variant association not found');
    const siblings = await this.buildPublicStoreOfferQuery()
      .andWhere('offer.storeProductUuid = :uuid', { uuid: row.storeProductUuid })
      .addOrderBy('offer.createdAt', 'ASC')
      .getMany();
    return plainToInstance(
      StorefrontOfferDetailEntity,
      { offer: this.toOfferEntity(row), siblingOffers: siblings.map((item) => this.toOfferEntity(item)) },
      { excludeExtraneousValues: true },
    );
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
      .leftJoinAndSelect('storeProduct.offers', 'offers')
      .leftJoinAndSelect('offers.variantSnapshot', 'variantSnapshot')
      .leftJoinAndSelect('offers.prices', 'prices')
      .leftJoinAndSelect('prices.currency', 'currency')
      .leftJoinAndMapOne(
        'offers.currentPrice',
        PriceHistoryModel,
        'current_price',
        'current_price.offerUuid = offers.uuid AND current_price.uuid = ' +
          '(SELECT price.uuid FROM price_history price WHERE price.offer_uuid = offers.uuid ORDER BY price.created_at DESC, price.uuid DESC LIMIT 1)',
      )
      .leftJoinAndSelect('current_price.currency', 'current_price_currency')
      .leftJoinAndSelect('offers.records', 'records')
      .leftJoinAndSelect('records.clarifications', 'clarifications')
      .leftJoinAndSelect('records.inventory', 'inventory')
      .addOrderBy('records.createdAt', 'ASC')
      .addOrderBy('records.uuid', 'ASC')
      .addOrderBy('clarifications.position', 'ASC')
      .addOrderBy('offers.createdAt', 'ASC')
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

  buildPublicStoreOfferQuery(manager: EntityManager = this.dataSource.manager) {
    return this.buildStoreOfferQuery(manager)
      .where('offer.status = :offerStatus', { offerStatus: StoreOfferStatus.ACTIVE })
      .andWhere('offer.showing = true')
      .andWhere('storeProduct.status = :storeProductStatus', { storeProductStatus: StoreProductStatus.ACTIVE })
      .andWhere('storeProduct.showing = true')
      .andWhere('productSnapshot.sourceProducer = :producer', { producer: 'product_srv_v2' })
      .andWhere('productSnapshot.status = :snapshotStatus', { snapshotStatus: 'active' })
      .andWhere('variantSnapshot.status = :snapshotStatus', { snapshotStatus: 'active' });
  }

  findByUuidWithManager(manager: EntityManager, storeProductUuid: string) {
    return this.buildStoreProductQuery(manager)
      .where('storeProduct.uuid = :uuid', { uuid: storeProductUuid })
      .getOneOrFail();
  }
}
