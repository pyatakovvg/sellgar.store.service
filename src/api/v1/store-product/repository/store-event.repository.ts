import { Injectable } from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import { EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { OutboxEventModel } from '../model/outbox-event.model';

@Injectable()
export class StoreEventRepository {
  add(
    manager: EntityManager,
    aggregateType: string,
    aggregateUuid: string,
    aggregateVersion: number,
    eventType: string,
    payload: object,
  ) {
    return manager.insert(OutboxEventModel, {
      uuid: randomUUID(),
      producer: 'store_srv',
      aggregateType,
      aggregateUuid,
      aggregateVersion,
      eventType,
      schemaVersion: 2,
      payload: instanceToPlain(payload),
      status: 'pending',
      attempts: 0,
    });
  }
}
