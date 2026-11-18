import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ClientProxy, RmqContext } from '@nestjs/microservices';
import { plainToInstance } from 'class-transformer';
import { config } from 'dotenv';
import { of, throwError } from 'rxjs';
import { DataSource } from 'typeorm';

import { SnapshotEventController } from '../src/api/v1/store-product/controller/snapshot-event.controller';
import { CatalogSyncService } from '../src/api/v1/store-product/service/catalog-sync.service';
import { IntegrationEventDto } from '../src/api/v1/store-product/service/dto/integration-event.dto';
import { ProductSnapshotPayloadDto } from '../src/api/v1/store-product/service/dto/product-snapshot-payload.dto';
import { SnapshotEventService } from '../src/api/v1/store-product/service/snapshot-event.service';
import { StoreDatabaseOptions } from '../src/database/store-database.options';

config({ path: '.env', quiet: true });

describe('Product snapshot recovery in PostgreSQL', () => {
  const schema = `store_recovery_test_${randomUUID().replace(/-/g, '')}`;
  const productUuid = randomUUID();
  const whiteUuid = randomUUID();
  const blackUuid = randomUUID();
  let control: DataSource;
  let source: DataSource;
  let snapshots: SnapshotEventService;
  let controller: SnapshotEventController;
  const send = jest.fn<ClientProxy['send']>();
  const ack = jest.fn();
  const nack = jest.fn();
  const message = {};
  const context = new RmqContext([message, { ack, nack }, 'product.updated']);
  const payload = (version: number) =>
    plainToInstance(ProductSnapshotPayloadDto, {
      uuid: productUuid,
      version,
      name: 'Кроссовки',
      status: 'active',
      variants: [
        { uuid: whiteUuid, name: 'Белые', status: 'active' },
        ...(version >= 6 ? [{ uuid: blackUuid, name: 'Чёрные', status: 'active' }] : []),
      ],
    });
  const event = (version: number) =>
    plainToInstance(IntegrationEventDto, {
      eventUuid: randomUUID(),
      eventType: 'product.updated',
      producer: 'product_srv_v2',
      aggregateType: 'product',
      aggregateId: productUuid,
      aggregateVersion: version,
      schemaVersion: 3,
      occurredAt: new Date().toISOString(),
      payload: payload(version),
    });

  beforeAll(async () => {
    control = await new DataSource({
      ...StoreDatabaseOptions.create(process.env),
      entities: [],
      migrations: [],
    }).initialize();
    await control.query(`CREATE SCHEMA "${schema}"`);
    source = await new DataSource(
      StoreDatabaseOptions.create({
        ...process.env,
        STORE_DATABASE_SCHEMA: schema,
      }),
    ).initialize();
    await source.runMigrations();
    snapshots = new SnapshotEventService(source);
    const sync = new CatalogSyncService({ send } as unknown as ClientProxy, snapshots);
    controller = new SnapshotEventController(snapshots, sync);
  });

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    if (control?.isInitialized) {
      await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await control.destroy();
    }
  });

  it('recovers 6,7,5 delivery, retries failed recovery and ignores duplicates without regression', async () => {
    await snapshots.synchronizeProduct(payload(4));
    const sixth = event(6);
    const seventh = event(7);
    send.mockReturnValue(throwError(() => new Error('Product unavailable')));

    await expect(controller.applyProductUpdatedEvent(sixth, context)).rejects.toThrow('Product unavailable');
    await expect(controller.applyProductUpdatedEvent(seventh, context)).rejects.toThrow('Product unavailable');
    expect(ack).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledTimes(2);

    await controller.applyProductUpdatedEvent(event(5), context);
    send.mockReturnValue(of(payload(7)));
    await controller.applyProductUpdatedEvent(sixth, context);
    await controller.applyProductUpdatedEvent(seventh, context);
    await controller.applyProductUpdatedEvent(sixth, context);
    await controller.applyProductUpdatedEvent(event(5), context);
    await snapshots.synchronizeProduct(payload(4));

    expect(send).toHaveBeenCalledTimes(3);
    expect(ack).toHaveBeenCalledTimes(5);
    expect(
      (await source.query('SELECT source_version FROM product_snapshot WHERE product_uuid = $1', [productUuid]))[0]
        .source_version,
    ).toBe(7);
    expect(await source.query('SELECT name, source_version FROM variant_snapshot ORDER BY name')).toEqual([
      { name: 'Белые', source_version: 7 },
      { name: 'Чёрные', source_version: 7 },
    ]);
    expect(await source.query('SELECT status FROM sync_issue ORDER BY received_version')).toEqual([
      { status: 'resolved' },
      { status: 'resolved' },
    ]);
    expect(await source.query("SELECT event_uuid FROM inbox_event WHERE status = 'parked'")).toEqual([]);
  });
});
