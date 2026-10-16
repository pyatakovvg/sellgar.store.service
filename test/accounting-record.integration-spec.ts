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
describe('Accounting records in PostgreSQL', () => {
  const schema = `store_test_${randomUUID().replace(/-/g, '')}`;
  const productUuid = randomUUID(),
    variantUuid = randomUUID(),
    secondVariantUuid = randomUUID(),
    shopUuid = randomUUID();
  let source: DataSource;
  let service: StoreProductService;
  let snapshots: SnapshotEventService;
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
      events = new StoreEventRepository(),
      queries = new StoreProductQueryRepository(source);
    const repository = new StoreProductRepository(
      commands,
      new StoreOfferRepository(new AccountingRecordRepository()),
      queries,
      events,
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
  });
  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });
  it('keeps the migrated schema consistent with ORM metadata', async () => {
    const changes = await source.driver.createSchemaBuilder().log();
    expect(changes.upQueries.map((query) => query.query)).toEqual([]);
  });
  it('creates one default record and no parent articles', async () => {
    product = await service.create(input());
    expect(product).not.toHaveProperty('article');
    expect(product.offers[0]).not.toHaveProperty('article');
    expect(product.offers[0].records).toHaveLength(1);
    expect(product.offers[0].records[0].article).toMatch(/^SKU-/);
    expect(product.offers[0].records[0].clarifications).toEqual([]);
    expect(product.offers[0].records[0].inventory.quantity).toBe(0);
    expect(product.offers[0].currentPrice.value).toBe('125.50');
  });
  it('concretizes the initial record and adds another without copying stock', async () => {
    const record = product.offers[0].records[0];
    await service.receiptInventory({
      commandId: randomUUID(),
      recordUuid: record.uuid,
      expectedVersion: 1,
      quantity: 12,
    });
    product = await service.update({
      commandId: randomUUID(),
      uuid: product.uuid,
      expectedVersion: product.version,
      offers: [
        {
          uuid: product.offers[0].uuid,
          variantUuid,
          showing: true,
          currentPrice: { value: '125.50', currencyCode: 'RUB' },
          records: [
            { uuid: record.uuid, article: 'BLUE-S', clarifications: [{ value: 'S евростандарт' }] },
            { article: 'BLUE-L', clarifications: [{ value: 'L евростандарт' }] },
          ],
        },
      ],
    });
    expect(product.offers[0].records).toHaveLength(2);
    const small = product.offers[0].records.find((item) => item.article === 'BLUE-S');
    const large = product.offers[0].records.find((item) => item.article === 'BLUE-L');
    expect(small.inventory.quantity).toBe(12);
    expect(large.inventory.quantity).toBe(0);
    expect(small.clarifications[0]).toMatchObject({ value: 'S евростандарт' });
    expect(small.clarifications[0]).not.toHaveProperty('name');
  });
  it('applies simultaneous duplicate commands once and stores an inventory outbox event', async () => {
    const record = product.offers[0].records.find((item) => item.article === 'BLUE-L');
    const command = { commandId: randomUUID(), recordUuid: record.uuid, expectedVersion: 1, quantity: 8 };
    const [first, retry] = await Promise.all([service.receiptInventory(command), service.receiptInventory(command)]);
    expect(first.uuid).toBe(retry.uuid);
    expect(first.quantity).toBe(8);
    expect(retry.quantity).toBe(8);
    const [row] = await source.query('SELECT count(*)::int AS count FROM inventory_movement WHERE record_uuid=$1', [
      record.uuid,
    ]);
    expect(row.count).toBe(1);
    const [outbox] = await source.query(
      "SELECT payload FROM outbox_event WHERE aggregate_type='record_inventory' AND aggregate_uuid=$1",
      [first.uuid],
    );
    expect(outbox.payload.recordUuid).toBe(record.uuid);
    await expect(service.receiptInventory({ ...command, quantity: 7 })).rejects.toThrow('Command id was already used');
  });
  it('rejects stale writes and overdraw without a movement or stock change', async () => {
    const record = product.offers[0].records.find((item) => item.article === 'BLUE-L');
    await expect(
      service.writeOffInventory({ commandId: randomUUID(), recordUuid: record.uuid, expectedVersion: 1, quantity: 1 }),
    ).rejects.toThrow('version conflict');
    await expect(
      service.writeOffInventory({ commandId: randomUUID(), recordUuid: record.uuid, expectedVersion: 2, quantity: 9 }),
    ).rejects.toThrow('invalid stock');
    const [row] = await source.query('SELECT quantity,version FROM record_inventory WHERE record_uuid=$1', [
      record.uuid,
    ]);
    expect(row).toEqual({ quantity: 8, version: 2 });
  });
  it('permits zero adjustment and enforces inventory quantity and reservation checks in SQL', async () => {
    const record = product.offers[0].records.find((item) => item.article === 'BLUE-L');
    const inventory = await service.adjustInventory({
      commandId: randomUUID(),
      recordUuid: record.uuid,
      expectedVersion: 2,
      quantity: 0,
    });
    expect(inventory.quantity).toBe(0);
    const [movement] = await source.query(
      "SELECT source_type FROM inventory_movement WHERE record_uuid=$1 AND type='adjustment'",
      [record.uuid],
    );
    expect(movement.source_type).toBe('correction');
    await expect(
      source.query('UPDATE record_inventory SET reserved=1 WHERE record_uuid=$1', [record.uuid]),
    ).rejects.toThrow();
    await expect(
      source.query('UPDATE record_inventory SET quantity=-1 WHERE record_uuid=$1', [record.uuid]),
    ).rejects.toThrow();
  });
  it('allows arbitrary combined text, preserves order and does not filter sibling records from search results', async () => {
    const record = product.offers[0].records.find((item) => item.article === 'BLUE-L');
    product = await service.update({
      commandId: randomUUID(),
      uuid: product.uuid,
      expectedVersion: product.version,
      offers: [
        {
          uuid: product.offers[0].uuid,
          variantUuid,
          showing: true,
          currentPrice: { value: '125.50', currencyCode: 'RUB' },
          records: [
            { uuid: record.uuid, clarifications: [{ value: 'L евростандарт' }, { value: 'Подарочная упаковка' }] },
          ],
        },
      ],
    });
    const result = await service.getAll({ search: 'BLUE-L' });
    expect(result.data[0].offers[0].records).toHaveLength(2);
    expect(
      result.data[0].offers[0].records
        .find((item) => item.uuid === record.uuid)
        .clarifications.map((item) => item.value),
    ).toEqual(['L евростандарт', 'Подарочная упаковка']);
  });
  it('rejects duplicate articles and changes to a record owned by another association atomically', async () => {
    const other = await service.create({
      ...input(),
      offers: [{ variantUuid: secondVariantUuid, showing: true, currentPrice: { value: '150', currencyCode: 'RUB' } }],
    });
    const otherRecord = other.offers[0].records[0];
    const modify = (records: object[]) => ({
      commandId: randomUUID(),
      uuid: product.uuid,
      expectedVersion: product.version,
      offers: [
        {
          uuid: product.offers[0].uuid,
          variantUuid,
          showing: true,
          currentPrice: { value: '125.50', currencyCode: 'RUB' },
          records,
        },
      ],
    });
    await expect(service.update(modify([{ article: 'BLUE-S' }]) as never)).rejects.toThrow('already exists');
    await expect(service.update(modify([{ uuid: otherRecord.uuid, article: 'STOLEN' }]) as never)).rejects.toThrow(
      'does not belong',
    );
    expect((await service.getByUuid(product.uuid)).version).toBe(product.version);
    await expect(
      source.query('INSERT INTO accounting_record(offer_uuid,article) VALUES ($1,$2)', [
        product.offers[0].uuid,
        'BLUE-S',
      ]),
    ).rejects.toThrow();
    await expect(
      source.query('INSERT INTO record_clarification(record_uuid,position,value) VALUES ($1,10,$2)', [
        otherRecord.uuid,
        '   ',
      ]),
    ).rejects.toThrow();
  });
  it('protects parent membership and referenced inventory using foreign keys', async () => {
    const otherProduct = randomUUID(),
      otherVariant = randomUUID();
    await snapshots.apply(
      event(otherProduct, 1, 'active', [{ uuid: otherVariant, name: 'Другой вариант', status: 'active' }]),
    );
    await expect(
      service.create({
        ...input(),
        offers: [{ variantUuid: otherVariant, showing: true, currentPrice: { value: '1', currencyCode: 'RUB' } }],
      }),
    ).rejects.toThrow('another product');
    await expect(
      source.query('INSERT INTO store_offer(store_product_uuid,product_uuid,variant_uuid) VALUES ($1,$2,$3)', [
        product.uuid,
        productUuid,
        otherVariant,
      ]),
    ).rejects.toThrow();
    await expect(
      source.query('DELETE FROM accounting_record WHERE uuid=$1', [product.offers[0].records[0].uuid]),
    ).rejects.toThrow();
  });
  it('serializes competing stock writes and preserves reserved stock', async () => {
    const target = await service.create(input());
    const record = target.offers[0].records[0];
    const writes = await Promise.allSettled(
      [4, 7].map((quantity) =>
        service.receiptInventory({
          commandId: randomUUID(),
          recordUuid: record.uuid,
          expectedVersion: 1,
          quantity,
        }),
      ),
    );
    expect(writes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(writes.filter((item) => item.status === 'rejected')).toHaveLength(1);
    const [stock] = await source.query('SELECT quantity,version FROM record_inventory WHERE record_uuid=$1', [
      record.uuid,
    ]);
    expect(stock.version).toBe(2);
    await source.query('UPDATE record_inventory SET reserved=2 WHERE record_uuid=$1', [record.uuid]);
    await expect(
      service.writeOffInventory({
        commandId: randomUUID(),
        recordUuid: record.uuid,
        expectedVersion: 2,
        quantity: stock.quantity - 1,
      }),
    ).rejects.toThrow('invalid stock');
    const [movements] = await source.query(
      'SELECT count(*)::int AS count FROM inventory_movement WHERE record_uuid=$1',
      [record.uuid],
    );
    expect(movements.count).toBe(1);
  });

  it('keeps shop filtering when the product name matches the search', async () => {
    const result = await service.getAll({ shopUuid: randomUUID(), search: 'Майка' });
    expect(result.data).toEqual([]);
  });

  it('filters unavailable records in public SQL while keeping all records in admin queries', async () => {
    const catalogUuid = randomUUID();
    const catalogVariantUuid = randomUUID();
    await snapshots.apply(
      event(catalogUuid, 1, 'active', [{ uuid: catalogVariantUuid, name: 'Черная', status: 'active' }]),
    );
    const created = await service.create({
      ...input(),
      productUuid: catalogUuid,
      offers: [
        {
          variantUuid: catalogVariantUuid,
          showing: true,
          currentPrice: { value: '125.50', currencyCode: 'RUB' },
          records: [
            { article: 'AVAILABLE', clarifications: [{ value: 'Доступная' }] },
            { article: 'EMPTY', clarifications: [] },
            { article: 'RESERVED', clarifications: [{ value: 'Полностью зарезервирована' }] },
          ],
        },
      ],
    });
    const offer = created.offers[0];
    const available = offer.records.find((record) => record.article === 'AVAILABLE');
    const reserved = offer.records.find((record) => record.article === 'RESERVED');
    await source.query('UPDATE record_inventory SET quantity=5, reserved=1 WHERE record_uuid=$1', [available.uuid]);
    await source.query('UPDATE record_inventory SET quantity=5, reserved=5 WHERE record_uuid=$1', [reserved.uuid]);

    const details = await service.getOffer(offer.uuid, { availableMin: 1 });
    expect(details.offer.records.map((record) => record.article)).toEqual(['AVAILABLE']);
    expect(details.offer.records[0].inventory.available).toBe(4);
    expect(
      details.siblingOffers.flatMap((item) => item.records).every((record) => record.inventory.available > 0),
    ).toBe(true);
    const list = await service.getOffers({ availableMin: 1 });
    expect(list.data.find((item) => item.uuid === offer.uuid).records.map((record) => record.article)).toEqual([
      'AVAILABLE',
    ]);
    expect(list.meta.totalRows).toBe(list.data.length);
    expect((await service.getByUuid(created.uuid)).offers[0].records).toHaveLength(3);

    await source.query('UPDATE record_inventory SET reserved=quantity WHERE record_uuid=$1', [available.uuid]);
    await expect(service.getOffer(offer.uuid, { availableMin: 1 })).rejects.toThrow('not found');
    expect((await service.getOffers({ availableMin: 1 })).data.some((item) => item.uuid === offer.uuid)).toBe(false);
    expect((await service.getByUuid(created.uuid)).offers[0].records).toHaveLength(3);
  });

  const createFilterFixture = async () => {
    const catalogUuid = randomUUID();
    const red = randomUUID();
    const blue = randomUUID();
    const suffix = randomUUID().slice(0, 8);
    await snapshots.apply(
      event(catalogUuid, 1, 'active', [
        { uuid: red, name: 'Красная', status: 'active' },
        { uuid: blue, name: 'Синяя', status: 'active' },
      ]),
    );
    const created = await service.create({
      ...input(),
      productUuid: catalogUuid,
      showing: false,
      offers: [
        {
          variantUuid: red,
          showing: true,
          currentPrice: { value: '10', currencyCode: 'RUB' },
          records: [
            { article: `FILTER-LIVE-${suffix}`, clarifications: [{ value: 'Есть' }] },
            { article: `FILTER-ZERO-${suffix}`, clarifications: [] },
          ],
        },
        {
          variantUuid: blue,
          showing: false,
          currentPrice: { value: '10', currencyCode: 'RUB' },
          records: [
            { article: `FILTER-HELD-${suffix}`, clarifications: [] },
            { article: `FILTER-LOW-${suffix}`, clarifications: [] },
          ],
        },
      ],
    });
    for (const [article, quantity, reserved] of [
      ['LIVE', 5, 1],
      ['HELD', 10, 10],
      ['LOW', 3, 0],
    ] as const) {
      await source.query(
        `UPDATE record_inventory SET quantity=$1,reserved=$2
        WHERE record_uuid=(SELECT uuid FROM accounting_record WHERE article=$3)`,
        [quantity, reserved, `FILTER-${article}-${suffix}`],
      );
    }
    return { ...created, suffix };
  };

  it('applies flat showing flags, zero bounds and all six inclusive inventory bounds', async () => {
    const fixture = await createFilterFixture();
    const query = {
      productUuid: fixture.productUuid,
      productShowing: false,
      variantShowing: false,
      availableMin: 0,
      availableMax: 0,
    };
    const result = await service.getAll(query);
    expect(result.meta.totalRows).toBe(1);
    expect(result.data[0].offers).toHaveLength(1);
    expect(result.data[0].offers[0].showing).toBe(false);
    expect(result.data[0].offers[0].records.map((record) => record.article)).toEqual([`FILTER-HELD-${fixture.suffix}`]);
    const detail = await service.getByUuid(fixture.uuid, query);
    expect(detail.offers[0].records.map((record) => record.uuid)).toEqual(
      result.data[0].offers[0].records.map((record) => record.uuid),
    );
    const ranges = await service.getAll({
      productUuid: fixture.productUuid,
      quantityMin: 3,
      quantityMax: 5,
      reservedMin: 0,
      reservedMax: 1,
      availableMin: 3,
      availableMax: 4,
    });
    expect(
      ranges.data[0].offers
        .flatMap((offer) => offer.records)
        .map((record) => record.article)
        .sort(),
    ).toEqual([`FILTER-LIVE-${fixture.suffix}`, `FILTER-LOW-${fixture.suffix}`].sort());
    expect((await service.getAll({ productUuid: fixture.productUuid, productShowing: true })).data).toEqual([]);
    expect((await service.getByUuid(fixture.uuid)).offers.flatMap((offer) => offer.records)).toHaveLength(4);
    expect((await service.getOffers({ productUuid: fixture.productUuid })).data).toHaveLength(2);
  });

  it('requires variant and inventory conditions to match the same branch and record', async () => {
    const fixture = await createFilterFixture();
    expect(
      (await service.getAll({ productUuid: fixture.productUuid, variantShowing: true, quantityMin: 10 })).data,
    ).toEqual([]);
    expect(
      (
        await service.getAll({
          productUuid: fixture.productUuid,
          variantShowing: false,
          quantityMin: 10,
          availableMin: 1,
        })
      ).data,
    ).toEqual([]);
    await expect(service.getByUuid(fixture.uuid, { productShowing: true })).rejects.toThrow('not found');
    const offers = await service.getOffers({
      productUuid: fixture.productUuid,
      variantShowing: false,
      availableMin: 1,
    });
    expect(offers.meta.totalRows).toBe(1);
    const detail = await service.getOffer(offers.data[0].uuid, { variantShowing: false, availableMin: 1 });
    expect(detail.offer.records.map((record) => record.article)).toEqual([`FILTER-LOW-${fixture.suffix}`]);
    expect(detail.siblingOffers).toHaveLength(1);
  });

  it('filters owned product and variant statuses independently without hard-coded storefront rules', async () => {
    const fixture = await createFilterFixture();
    await source.query("UPDATE store_product SET status='disabled' WHERE uuid=$1", [fixture.uuid]);
    await source.query("UPDATE store_offer SET status='archived' WHERE store_product_uuid=$1 AND showing=false", [
      fixture.uuid,
    ]);
    const result = await service.getAll({
      productUuid: fixture.productUuid,
      productStatus: StoreProductStatus.DISABLED,
      variantStatus: StoreOfferStatus.ARCHIVED,
    });
    expect(result.data[0].status).toBe('disabled');
    expect(result.data[0].offers.map((offer) => offer.status)).toEqual(['archived']);
    expect(
      (await service.getAll({ productUuid: fixture.productUuid, productStatus: StoreProductStatus.ACTIVE })).data,
    ).toEqual([]);
    expect((await service.getAll({ productUuid: fixture.productUuid })).data[0].offers).toHaveLength(2);
  });

  it('searches names and articles using FTS and updates the document after renames', async () => {
    const fixture = await createFilterFixture();
    const query = { productUuid: fixture.productUuid };
    expect((await service.getAll({ ...query, search: 'майками' })).data).toHaveLength(1);
    const article = `FILTER-LIVE-${fixture.suffix}`;
    const found = await service.getAll({ ...query, search: article.toLowerCase() });
    expect(found.data[0].offers).toHaveLength(1);
    expect(found.data[0].offers[0].records).toHaveLength(2);
    expect((await service.getOffers({ ...query, search: 'красн FILTER-LIVE' })).data).toHaveLength(1);
    expect((await service.getAll({ ...query, search: `FILTER-HELD-${fixture.suffix}`, availableMin: 1 })).data).toEqual(
      [],
    );
    await source.query('UPDATE accounting_record SET article=$1 WHERE article=$2', [
      `RENAMED-${fixture.suffix}`,
      article,
    ]);
    expect((await service.getAll({ ...query, search: article })).data).toEqual([]);
    expect((await service.getAll({ ...query, search: `RENAMED-${fixture.suffix}` })).data).toHaveLength(1);
    await source.query("UPDATE product_snapshot SET name='Куртка' WHERE product_uuid=$1", [fixture.productUuid]);
    expect((await service.getAll({ ...query, search: 'майками' })).data).toEqual([]);
    expect((await service.getAll({ ...query, search: 'куртками' })).data).toHaveLength(1);
    await source.query("UPDATE variant_snapshot SET name='Желтая' WHERE variant_uuid=$1", [
      fixture.offers[0].variantUuid,
    ]);
    expect((await service.getAll({ ...query, search: 'желт' })).data).toHaveLength(1);
    expect((await service.getAll({ ...query, search: '%_ ()' })).data).toEqual([]);
    const indexes = await source.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND indexdef LIKE '%USING gin%'",
    );
    expect(indexes).toEqual([{ indexname: 'accounting_record_search_idx' }]);
  });

  it('ignores legacy catalog events and parks a gap until authoritative reconciliation', async () => {
    const legacy = event(randomUUID(), 1);
    legacy.producer = 'product_srv';
    legacy.schemaVersion = 1;
    await snapshots.apply(legacy);
    expect(
      (
        await source.query('SELECT count(*)::int AS count FROM product_snapshot WHERE product_uuid=$1', [
          legacy.aggregateId,
        ])
      )[0].count,
    ).toBe(0);
    const gap = event(productUuid, 3);
    await snapshots.apply(gap);
    expect(
      (await source.query('SELECT source_version FROM product_snapshot WHERE product_uuid=$1', [productUuid]))[0]
        .source_version,
    ).toBe(1);
    await snapshots.synchronizeProduct(plainToInstance(ProductSnapshotPayloadDto, gap.payload));
    expect(
      (await source.query('SELECT source_version FROM product_snapshot WHERE product_uuid=$1', [productUuid]))[0]
        .source_version,
    ).toBe(3);
    expect((await source.query('SELECT status FROM sync_issue WHERE event_uuid=$1', [gap.eventUuid]))[0].status).toBe(
      'resolved',
    );
  });
  it('keeps unfiltered Store reads independent of storefront catalog visibility', async () => {
    await snapshots.apply(event(productUuid, 4, 'archived'));
    const offers = await service.getOffers();
    expect(offers.data.some((item) => item.productUuid === productUuid)).toBe(true);
    expect((await service.getOffer(product.offers[0].uuid)).offer.uuid).toBe(product.offers[0].uuid);
    expect((await service.getByUuid(product.uuid)).offers[0].records).toHaveLength(2);
  });
});
