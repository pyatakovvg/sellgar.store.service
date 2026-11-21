import { Injectable } from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import { EntityManager } from 'typeorm';
import { OutboxWriter } from '@sellgar/outbox';

@Injectable()
export class StoreEventRepository {
  constructor(private readonly outbox: OutboxWriter) {}

  add(
    manager: EntityManager,
    aggregateType: string,
    aggregateUuid: string,
    aggregateVersion: number,
    eventType: string,
    payload: object,
  ) {
    return this.outbox.add(manager, {
      aggregateType,
      aggregateId: aggregateUuid,
      aggregateVersion,
      eventType,
      schemaVersion: aggregateType === 'store_product' ? 3 : 2,
      payload: instanceToPlain(payload),
    });
  }
}
