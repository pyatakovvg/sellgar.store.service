import 'reflect-metadata';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RmqContext } from '@nestjs/microservices';

import { CatalogSyncService } from '../service/catalog-sync.service';
import { IntegrationEventDto } from '../service/dto/integration-event.dto';
import { SnapshotEventService } from '../service/snapshot-event.service';
import { SnapshotEventController } from './snapshot-event.controller';

describe(SnapshotEventController.name, () => {
  const apply = jest.fn<SnapshotEventService['apply']>();
  const synchronize = jest.fn<CatalogSyncService['synchronize']>();
  const ack = jest.fn();
  const nack = jest.fn();
  const message = {};
  const context = {
    getChannelRef: () => ({ ack, nack }),
    getMessage: () => message,
  } as unknown as RmqContext;
  const controller = new SnapshotEventController(
    { apply } as unknown as SnapshotEventService,
    { synchronize } as unknown as CatalogSyncService,
  );
  const event = {
    producer: 'product_srv_v2',
    aggregateType: 'product',
    aggregateId: '11111111-1111-4111-8111-111111111111',
    schemaVersion: 3,
  } as IntegrationEventDto;

  beforeEach(() => {
    jest.resetAllMocks();
    synchronize.mockResolvedValue({ productUuid: event.aggregateId, version: 7 });
  });

  it('recovers an out-of-order Product snapshot before acknowledging the event', async () => {
    apply.mockResolvedValue('parked');

    await controller.applyProductUpdatedEvent(event, context);

    expect(synchronize).toHaveBeenCalledWith(event.aggregateId);
    expect(ack).toHaveBeenCalledWith(message);
    expect(synchronize.mock.invocationCallOrder[0]).toBeLessThan(ack.mock.invocationCallOrder[0]);
    expect(nack).not.toHaveBeenCalled();
  });

  it('requeues the event when authoritative recovery fails', async () => {
    apply.mockResolvedValue('parked');
    synchronize.mockRejectedValue(new Error('Product unavailable'));

    await expect(controller.applyProductUpdatedEvent(event, context)).rejects.toThrow('Product unavailable');

    expect(nack).toHaveBeenCalledWith(message, false, true);
    expect(ack).not.toHaveBeenCalled();
  });

  it('does not fetch an additional snapshot for a processed event', async () => {
    apply.mockResolvedValue('processed');

    await controller.applyProductUpdatedEvent(event, context);

    expect(synchronize).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(message);
  });

  it('does not use Product recovery for another producer', async () => {
    apply.mockResolvedValue('parked');

    await controller.applyShopUpdatedEvent({ ...event, producer: 'shop_srv', aggregateType: 'shop' }, context);

    expect(synchronize).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(message);
  });
});
