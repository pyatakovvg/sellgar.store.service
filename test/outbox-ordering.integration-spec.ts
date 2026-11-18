import { STORE_OUTBOX_OPTIONS } from '../src/integration/outbox/store-outbox.options';
import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { ClientProxy } from '@nestjs/microservices';
import { config } from 'dotenv';
import { of, throwError } from 'rxjs';
import { DataSource } from 'typeorm';

import { OutboxEventModel } from '../src/api/v1/store-product/model/outbox-event.model';
import { OutboxRepository } from '@sellgar/outbox';
import { OutboxRelayService } from '@sellgar/outbox';
import { StoreDatabaseOptions } from '../src/database/store-database.options';

config({ path: '.env', quiet: true });

describe('Store outbox ordering in PostgreSQL', () => {
  const schema = `store_outbox_test_${randomUUID().replace(/-/g, '')}`;
  const productUuid = randomUUID();
  const otherProductUuid = randomUUID();
  let control: DataSource;
  let source: DataSource;
  let repository: OutboxRepository;

  beforeAll(async () => {
    control = await new DataSource({
      ...StoreDatabaseOptions.create(process.env),
      entities: [],
      migrations: [],
    }).initialize();
    await control.query(`CREATE SCHEMA "${schema}"`);
    source = await new DataSource({
      ...StoreDatabaseOptions.create({ ...process.env, STORE_DATABASE_SCHEMA: schema }),
      entities: [OutboxEventModel],
      migrations: [],
    }).initialize();
    await source.synchronize();
    repository = new OutboxRepository(source, STORE_OUTBOX_OPTIONS);
  });

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    if (control?.isInitialized) {
      await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await control.destroy();
    }
  });

  beforeEach(async () => {
    await source.manager.clear(OutboxEventModel);
  });

  const append = (version: number, overrides: Partial<OutboxEventModel> = {}) =>
    source.manager.insert(OutboxEventModel, {
      uuid: randomUUID(),
      producer: 'store_srv',
      aggregateType: 'store_product',
      aggregateUuid: productUuid,
      aggregateVersion: version,
      eventType: 'store.product.updated',
      schemaVersion: 1,
      payload: { version },
      occurredAt: new Date('2026-01-01T00:00:00Z'),
      nextAttemptAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    });
  const claim = () => repository.claimPublishableEvents({ batchSize: 50, maxAttempts: 10 });

  it('publishes by version rather than insertion order or timestamp', async () => {
    await append(3, { occurredAt: new Date('2025-01-01T00:00:00Z') });
    await append(2);
    await append(1);
    for (const version of [1, 2, 3]) {
      const events = await claim();
      expect(events.map((event) => event.aggregateVersion)).toEqual([version]);
      await repository.markPublished(events[0]);
    }
  });

  it('does not let concurrent publishers claim a successor', async () => {
    await append(1);
    await append(2);
    const events = (await Promise.all([claim(), claim()])).flat();
    expect(events.map((event) => event.aggregateVersion)).toEqual([1]);
    expect(await claim()).toEqual([]);
  });

  it('does not skip a locked predecessor', async () => {
    await append(1);
    await append(2);
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query('SELECT uuid FROM outbox_event WHERE aggregate_version = 1 FOR UPDATE');
      expect(await claim()).toEqual([]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('blocks successors during backoff and after terminal failure without blocking other products', async () => {
    await append(1, { status: 'failed', nextAttemptAt: new Date(Date.now() + 60000) });
    await append(2);
    await append(1, { aggregateUuid: otherProductUuid });
    expect((await claim()).map((event) => event.aggregateId)).toEqual([otherProductUuid]);
    await source.manager.update(
      OutboxEventModel,
      { aggregateUuid: productUuid, aggregateVersion: 1 },
      {
        status: 'dead',
        attempts: 10,
      },
    );
    expect(await claim()).toEqual([]);
  });

  it('retries the failed predecessor before the successor', async () => {
    await append(1);
    await append(2);
    const [first] = await claim();
    await repository.markFailed(first, new Date('2026-01-01T00:00:00Z'), new Error('broker'), false);
    const events = await claim();
    expect(events.map((event) => event.aggregateVersion)).toEqual([1]);
    await repository.markPublished(events[0]);
    expect((await claim()).map((event) => event.aggregateVersion)).toEqual([2]);
  });

  it('drains successive versions in the same cycle within the configured budget', async () => {
    for (const version of [4, 3, 2, 1]) await append(version);
    const published: number[] = [];
    const client = {
      emit: (_type: string, event: OutboxEventModel) => {
        published.push(event.aggregateVersion);
        return of(null);
      },
    } as unknown as ClientProxy;
    const relay = new OutboxRelayService(client, { ...STORE_OUTBOX_OPTIONS, batchSize: 3 }, repository);
    await (relay as unknown as { publishPending(): Promise<void> }).publishPending();
    expect(published).toEqual([1, 2, 3]);
  });

  it('continues with other products after a publish failure', async () => {
    await append(1);
    await append(2);
    await append(1, { aggregateUuid: otherProductUuid });
    const client = {
      emit: (_type: string, event: OutboxEventModel) =>
        event.aggregateUuid === productUuid ? throwError(() => new Error('broker')) : of(null),
    } as unknown as ClientProxy;
    const relay = new OutboxRelayService(client, STORE_OUTBOX_OPTIONS, repository);
    await (relay as unknown as { publishPending(): Promise<void> }).publishPending();
    const events = await source.manager.find(OutboxEventModel, {
      where: { aggregateUuid: productUuid },
      order: { aggregateVersion: 'ASC' },
    });
    expect(events.map((event) => event.status)).toEqual(['failed', 'pending']);
    expect((await source.manager.findOneByOrFail(OutboxEventModel, { aggregateUuid: otherProductUuid })).status).toBe(
      'published',
    );
  });
});
