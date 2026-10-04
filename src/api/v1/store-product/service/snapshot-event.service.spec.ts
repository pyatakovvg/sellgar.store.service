import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DataSource, EntityManager } from 'typeorm';

import { InboxEventModel } from '../inbox-event.model';
import { ProductSnapshotModel } from '../product-snapshot.model';
import { VariantSnapshotModel } from '../variant-snapshot.model';
import { IntegrationEventDto } from './dto/integration-event.dto';
import { SnapshotEventService } from './snapshot-event.service';

describe(SnapshotEventService.name, () => {
  const productUuid = '11111111-1111-4111-8111-111111111111';
  const variantUuid = '22222222-2222-4222-8222-222222222222';
  const manager = {
    findOne: jest.fn<(model: unknown) => Promise<unknown>>(),
    upsert: jest.fn<(...args: unknown[]) => Promise<void>>(),
    insert: jest.fn<(...args: unknown[]) => Promise<void>>(),
  };
  const dataSource = {
    transaction: jest.fn((operation: (entityManager: EntityManager) => Promise<void>) =>
      operation(manager as unknown as EntityManager),
    ),
  };
  const service = new SnapshotEventService(dataSource as unknown as DataSource);

  const event = plainToInstance(IntegrationEventDto, {
    eventUuid: '33333333-3333-4333-8333-333333333333',
    eventType: 'product.updated',
    schemaVersion: 3,
    producer: 'product_srv_v2',
    aggregateType: 'product',
    aggregateId: productUuid,
    aggregateVersion: 2,
    occurredAt: '2026-10-04T12:00:00.000Z',
    payload: {
      uuid: productUuid,
      name: 'Майка',
      status: 'active',
      version: 2,
      variants: [{ uuid: variantUuid, name: 'Синяя', status: 'active' }],
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    manager.findOne.mockImplementation(async (model: unknown) => {
      if (model === InboxEventModel) return null;
      if (model === ProductSnapshotModel) return { sourceVersion: 1 };
      return null;
    });
    manager.upsert.mockResolvedValue(undefined);
    manager.insert.mockResolvedValue(undefined);
  });

  it('applies product and variant snapshots from one product aggregate event', async () => {
    await service.apply(event);

    expect(manager.upsert).toHaveBeenCalledWith(
      ProductSnapshotModel,
      [expect.objectContaining({ productUuid, sourceVersion: 2, name: 'Майка', status: 'active' })],
      ['productUuid'],
    );
    expect(manager.upsert).toHaveBeenCalledWith(
      VariantSnapshotModel,
      [expect.objectContaining({ variantUuid, productUuid, sourceVersion: 2, name: 'Синяя', status: 'active' })],
      ['variantUuid'],
    );
    expect(manager.upsert).toHaveBeenCalledWith(
      InboxEventModel,
      [expect.objectContaining({ eventUuid: event.eventUuid, aggregateId: productUuid, status: 'processed' })],
      ['eventUuid'],
    );
  });

  it('rejects an envelope that does not identify its payload product', async () => {
    const invalid = plainToInstance(IntegrationEventDto, {
      ...event,
      aggregateId: '44444444-4444-4444-8444-444444444444',
    });

    await expect(service.apply(invalid)).rejects.toThrow('Product event envelope does not match its payload');
    expect(manager.upsert).not.toHaveBeenCalled();
  });

  it('does not apply an event already recorded as processed', async () => {
    manager.findOne.mockResolvedValueOnce({ status: 'processed' });

    await service.apply(event);

    expect(manager.upsert).not.toHaveBeenCalled();
  });
});
