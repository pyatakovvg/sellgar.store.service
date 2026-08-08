import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { describe, expect, it, jest } from '@jest/globals';
import { of, throwError } from 'rxjs';

import { OutboxEventModel } from '../outbox-event.model';
import { OutboxRepository } from '../repository/outbox.repository';
import { OutboxRelayService } from './outbox-relay.service';

interface TestableOutboxRelay {
  publishPending(): Promise<void>;
}

describe(OutboxRelayService.name, () => {
  const event = Object.assign(new OutboxEventModel(), {
    uuid: '2c0e9f37-5b22-4cc5-843a-0ab23bb82517',
    producer: 'store_srv',
    aggregateType: 'store_product',
    aggregateUuid: 'd08854bb-8cdd-4c85-b458-30a1a977c3bf',
    aggregateVersion: 4,
    eventType: 'store.product.updated',
    schemaVersion: 1,
    payload: { storeProductUuid: 'd08854bb-8cdd-4c85-b458-30a1a977c3bf' },
    occurredAt: new Date('2026-08-08T18:00:00.000Z'),
    attempts: 0,
    status: 'processing',
  });

  const config = { get: jest.fn(() => undefined) } as unknown as ConfigService;

  function repository() {
    return {
      claim: jest.fn<OutboxRepository['claim']>().mockResolvedValue([event]),
      markPublished: jest.fn<OutboxRepository['markPublished']>().mockResolvedValue(undefined),
      markFailed: jest.fn<OutboxRepository['markFailed']>().mockResolvedValue(undefined),
      metrics: jest
        .fn<OutboxRepository['metrics']>()
        .mockResolvedValue({ pending: 0, processing: 0, failed: 0, dead: 0 }),
    };
  }

  it('publishes the standard envelope and marks the event as published', async () => {
    const eventClient = { emit: jest.fn(() => of(undefined)) } as unknown as ClientProxy;
    const outbox = repository();
    const relay = new OutboxRelayService(eventClient, config, outbox as unknown as OutboxRepository);

    await (relay as unknown as TestableOutboxRelay).publishPending();

    expect(eventClient.emit).toHaveBeenCalledWith('store.product.updated', {
      eventUuid: event.uuid,
      eventType: event.eventType,
      schemaVersion: event.schemaVersion,
      producer: event.producer,
      aggregateType: event.aggregateType,
      aggregateUuid: event.aggregateUuid,
      aggregateVersion: event.aggregateVersion,
      occurredAt: event.occurredAt.toISOString(),
      payload: event.payload,
    });
    expect(outbox.markPublished).toHaveBeenCalledWith(event.uuid, 0);
    expect(outbox.markFailed).not.toHaveBeenCalled();
  });

  it('keeps a failed event retryable', async () => {
    const publishError = new Error('RabbitMQ unavailable');
    const eventClient = { emit: jest.fn(() => throwError(() => publishError)) } as unknown as ClientProxy;
    const outbox = repository();
    const relay = new OutboxRelayService(eventClient, config, outbox as unknown as OutboxRepository);

    await (relay as unknown as TestableOutboxRelay).publishPending();

    expect(outbox.markPublished).not.toHaveBeenCalled();
    expect(outbox.markFailed).toHaveBeenCalledWith(
      event.uuid,
      0,
      expect.any(Date),
      publishError,
      false,
    );
  });
});
