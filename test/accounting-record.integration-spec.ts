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
    const result = await service.getAll({ search: 'Подарочная' });
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
  it('hides archived catalog items from both storefront list and details without deleting stock', async () => {
    await snapshots.apply(event(productUuid, 4, 'archived'));
    const offers = await service.getOffers();
    expect(offers.data.some((item) => item.productUuid === productUuid)).toBe(false);
    await expect(service.getOffer(product.offers[0].uuid)).rejects.toThrow('not found');
    expect((await service.getByUuid(product.uuid)).offers[0].records).toHaveLength(2);
  });
});
