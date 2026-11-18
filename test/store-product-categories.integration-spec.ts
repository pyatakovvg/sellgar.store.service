import { OutboxWriter } from '@sellgar/outbox';
import { STORE_OUTBOX_OPTIONS } from '../src/integration/outbox/store-outbox.options';
import { CategoryService } from '../src/api/v1/category/service/category.service';
import { CategoryRepository } from '../src/api/v1/category/repository/category.repository';
import { CategoryCommandRepository } from '../src/api/v1/category/repository/category-command.repository';
import { StoreProductCategoryRepository } from '../src/api/v1/store-product/repository/store-product-category.repository';
import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { StoreDatabaseOptions } from '../src/database/store-database.options';
import { StoreProductRepository } from '../src/api/v1/store-product/repository/store-product.repository';
import { StoreProductQueryRepository } from '../src/api/v1/store-product/repository/store-product-query.repository';
import { StoreOfferRepository } from '../src/api/v1/store-product/repository/store-offer.repository';
import { AccountingRecordRepository } from '../src/api/v1/store-product/repository/accounting-record.repository';
import { CommandRequestRepository } from '../src/api/v1/store-product/repository/command-request.repository';
import { StoreEventRepository } from '../src/api/v1/store-product/repository/store-event.repository';
import { InventoryRepository } from '../src/api/v1/store-product/repository/inventory.repository';
import { StoreProductService } from '../src/api/v1/store-product/service/store-product.service';
import { CommandFactory } from '../src/api/v1/store-product/service/command/command.factory';
import { SnapshotEventService } from '../src/api/v1/store-product/service/snapshot-event.service';
import { ProductSnapshotPayloadDto } from '../src/api/v1/store-product/service/dto/product-snapshot-payload.dto';
import { IntegrationEventDto } from '../src/api/v1/store-product/service/dto/integration-event.dto';
import { StoreProductStatus } from '../src/api/v1/store-product/enum/store-product-status.enum';
import { StoreOfferStatus } from '../src/api/v1/store-product/enum/store-offer-status.enum';
import { StoreProductEntity } from '../src/api/v1/store-product/entity';

import { config } from 'dotenv';
config({ path: '.env', quiet: true });

// The suite owns only this randomly named schema, never public tables.
describe('Store product category assignments in PostgreSQL', () => {
  const schema = `store_categories_test_${randomUUID().replace(/-/g, '')}`;
  const productUuid = randomUUID(),
    variantUuid = randomUUID(),
    secondVariantUuid = randomUUID(),
    shopUuid = randomUUID();
  let source: DataSource;
  let service: StoreProductService;
  let snapshots: SnapshotEventService;
  let categories: CategoryService;
  const leafUuid = randomUUID(),
    secondLeafUuid = randomUUID(),
    parentUuid = randomUUID(),
    foreignUuid = randomUUID(),
    otherShopUuid = randomUUID();
  let product: StoreProductEntity;
  const input = () => ({
    commandId: randomUUID(),
    shopUuid,
    productUuid,
    showing: true,
    offers: [{ variantUuid, showing: true, currentPrice: { value: '125.5', currencyCode: 'RUB' } }],
  });
  const event = (
    uuid: string,
    version: number,
    status = 'active',
    variants = [
      { uuid: variantUuid, name: 'Синяя', status },
      { uuid: secondVariantUuid, name: 'Зеленая', status: 'active' },
    ],
  ) =>
    plainToInstance(IntegrationEventDto, {
      eventUuid: randomUUID(),
      eventType: 'product.updated',
      schemaVersion: 3,
      producer: 'product_srv_v2',
      aggregateType: 'product',
      aggregateId: uuid,
      aggregateVersion: version,
      occurredAt: new Date().toISOString(),
      payload: { uuid, version, name: 'Майка', status, variants },
    });
  beforeAll(async () => {
    const control = await new DataSource({
      ...StoreDatabaseOptions.create(process.env),
      entities: [],
      migrations: [],
    }).initialize();
    await control.query(`CREATE SCHEMA "${schema}"`);
    await control.destroy();
    source = await new DataSource(
      StoreDatabaseOptions.create({ ...process.env, STORE_DATABASE_SCHEMA: schema }),
    ).initialize();
    await source.runMigrations();
    const commands = new CommandRequestRepository(source),
      events = new StoreEventRepository(new OutboxWriter(STORE_OUTBOX_OPTIONS)),
      queries = new StoreProductQueryRepository(source, new StoreProductCategoryRepository());
    const repository = new StoreProductRepository(
      commands,
      new StoreOfferRepository(new AccountingRecordRepository()),
      queries,
      events,
      new StoreProductCategoryRepository(),
    );
    service = new StoreProductService(
      repository,
      queries,
      new InventoryRepository(commands, events),
      new CommandFactory(),
    );
    snapshots = new SnapshotEventService(source);
    await source.query(`INSERT INTO currency(code,value) VALUES ('RUB','Российский рубль')`);
    await source.query(`INSERT INTO shop_snapshot(shop_uuid,source_version,name) VALUES ($1,1,'Магазин')`, [shopUuid]);
    await snapshots.apply(event(productUuid, 1));
    categories = new CategoryService(
      new CategoryRepository(source),
      new CategoryCommandRepository(commands, events),
      new CommandFactory(),
    );
    await source.query("INSERT INTO shop_snapshot(shop_uuid,source_version,name) VALUES ($1,1,'Другой')", [
      otherShopUuid,
    ]);
    await source.query(
      "INSERT INTO category(uuid,shop_uuid,name) VALUES ($1,$2,'Посуда'),($3,$2,'Текстиль'),($4,$5,'Чужая')",
      [parentUuid, shopUuid, secondLeafUuid, foreignUuid, otherShopUuid],
    );
    await source.query("INSERT INTO category(uuid,shop_uuid,parent_uuid,name) VALUES ($1,$2,$3,'Кружки')", [
      leafUuid,
      shopUuid,
      parentUuid,
    ]);
  });
  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });

  it('keeps the association migration consistent with ORM metadata', async () => {
    const changes = await source.driver.createSchemaBuilder().log();
    expect(changes.upQueries.map((query) => query.query)).toEqual([]);
  });

  it('creates a product with several leaves and returns them in reads and outbox', async () => {
    product = await service.create({ ...input(), categoryUuids: [leafUuid, secondLeafUuid] });
    const details = await service.getOffer(product.offers[0].uuid);
    expect(details.categories).toEqual(
      [
        {
          categoryUuid: leafUuid,
          items: [
            { uuid: parentUuid, name: 'Посуда' },
            { uuid: leafUuid, name: 'Кружки' },
          ],
        },
        { categoryUuid: secondLeafUuid, items: [{ uuid: secondLeafUuid, name: 'Текстиль' }] },
      ].sort((a, b) => a.categoryUuid.localeCompare(b.categoryUuid)),
    );
    const expected = [leafUuid, secondLeafUuid].sort();
    expect(product.categoryUuids).toEqual(expected);
    expect((await service.getByUuid(product.uuid)).categoryUuids).toEqual(expected);
    expect((await service.getAll({})).data[0].categoryUuids).toEqual(expected);
    const [outbox] = await source.query(
      "SELECT payload FROM outbox_event WHERE aggregate_uuid=$1 AND event_type='store.product.created'",
      [product.uuid],
    );
    expect(outbox.payload.categoryUuids).toEqual(expected);
  });

  it('rebuilds paths from current category names and parents without changing product assignments', async () => {
    const root = await categories.create({
      commandId: randomUUID(),
      shopUuid,
      name: 'Дом',
      parentUuid: null,
      description: null,
    });
    await categories.update({
      commandId: randomUUID(),
      uuid: parentUuid,
      expectedVersion: 1,
      name: 'Кухня',
      parentUuid: root.uuid,
      description: null,
    });
    const details = await service.getOffer(product.offers[0].uuid);
    expect(details.categories.find((path) => path.categoryUuid === leafUuid)?.items).toEqual([
      { uuid: root.uuid, name: 'Дом' },
      { uuid: parentUuid, name: 'Кухня' },
      { uuid: leafUuid, name: 'Кружки' },
    ]);
    expect((await service.getByUuid(product.uuid)).categoryUuids).toEqual([leafUuid, secondLeafUuid].sort());
  });

  it('replaces, preserves omitted assignments, clears explicitly and replays idempotently', async () => {
    const command = {
      commandId: randomUUID(),
      uuid: product.uuid,
      expectedVersion: product.version,
      categoryUuids: [secondLeafUuid],
    };
    product = await service.update(command);
    const retry = await service.update(command);
    expect(retry.version).toBe(product.version);
    expect(retry.categoryUuids).toEqual([secondLeafUuid]);
    product = await service.update({
      commandId: randomUUID(),
      uuid: product.uuid,
      expectedVersion: product.version,
      showing: false,
    });
    expect(product.categoryUuids).toEqual([secondLeafUuid]);
    product = await service.update({
      commandId: randomUUID(),
      uuid: product.uuid,
      expectedVersion: product.version,
      categoryUuids: [],
    });
    expect(product.categoryUuids).toEqual([]);
    expect((await service.getOffer(product.offers[0].uuid)).categories).toEqual([]);
    expect(
      await source.query('SELECT 1 FROM store_product_category WHERE store_product_uuid=$1', [product.uuid]),
    ).toEqual([]);
  });

  it('rejects branches, foreign/missing categories, duplicates and null without partially saving', async () => {
    const version = product.version;
    for (const ids of [[parentUuid], [foreignUuid], [randomUUID()], [leafUuid, leafUuid], null]) {
      await expect(
        service.update({
          commandId: randomUUID(),
          uuid: product.uuid,
          expectedVersion: version,
          showing: true,
          categoryUuids: ids as string[],
        }),
      ).rejects.toBeDefined();
      const current = await service.getByUuid(product.uuid);
      expect(current.version).toBe(version);
      expect(current.showing).toBe(false);
      expect(current.categoryUuids).toEqual([]);
    }
  });

  it('enforces shop ownership through composite database foreign keys', async () => {
    await expect(
      source.query(
        'INSERT INTO store_product_category(store_product_uuid, category_uuid, shop_uuid) VALUES($1,$2,$3)',
        [product.uuid, foreignUuid, shopUuid],
      ),
    ).rejects.toMatchObject({ driverError: { constraint: 'store_product_category_category_fk' } });
    await expect(
      source.query(
        'INSERT INTO store_product_category(store_product_uuid, category_uuid, shop_uuid) VALUES($1,$2,$3)',
        [product.uuid, foreignUuid, otherShopUuid],
      ),
    ).rejects.toMatchObject({ driverError: { constraint: 'store_product_category_product_fk' } });
  });

  it('serializes assigning a leaf against turning it into a branch', async () => {
    const results = await Promise.allSettled([
      service.update({
        commandId: randomUUID(),
        uuid: product.uuid,
        expectedVersion: product.version,
        categoryUuids: [secondLeafUuid],
      }),
      categories.create({
        commandId: randomUUID(),
        shopUuid,
        parentUuid: secondLeafUuid,
        name: 'Подкатегория',
        description: null,
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const invalid = await source.query(
      'SELECT 1 FROM store_product_category link JOIN category child ON child.parent_uuid = link.category_uuid WHERE link.store_product_uuid=$1',
      [product.uuid],
    );
    expect(invalid).toEqual([]);
  });
});
