import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';

import { DataSource, EntityManager, LessThanOrEqual } from 'typeorm';

import { InboxEventModel } from '../model/inbox-event.model';
import { ProductSnapshotModel } from '../model/product-snapshot.model';
import { ShopSnapshotModel } from '../model/shop-snapshot.model';
import { SyncIssueModel } from '../model/sync-issue.model';
import { VariantSnapshotModel } from '../model/variant-snapshot.model';

import { IntegrationEventDto } from './dto/integration-event.dto';
import { ProductSnapshotPayloadDto } from './dto/product-snapshot-payload.dto';

type EventApplyStatus = 'processed' | 'ignored' | 'parked';

@Injectable()
export class SnapshotEventService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async apply(event: IntegrationEventDto) {
    await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${event.producer}:${event.aggregateType}:${event.aggregateId}`,
      ]);
      const existing = await manager.findOne(InboxEventModel, { where: { eventUuid: event.eventUuid } });

      if (existing?.status === 'processed' || existing?.status === 'ignored') {
        return;
      }

      let status: EventApplyStatus = 'ignored';

      if (event.aggregateType === 'shop') {
        status = await this.applyShopEvent(manager, event);
      } else if (
        event.aggregateType === 'product' &&
        event.producer === 'product_srv_v2' &&
        event.schemaVersion === 3
      ) {
        status = await this.applyProductEvent(manager, event);
      }

      await this.recordInboxEvent(manager, event, status, existing?.attempts ?? 0);
    });
  }

  private async applyShopEvent(manager: EntityManager, event: IntegrationEventDto): Promise<EventApplyStatus> {
    const current = await manager.findOne(ShopSnapshotModel, { where: { shopUuid: event.aggregateId } });

    const preflightStatus = await this.checkVersion(manager, event, current?.sourceVersion);

    if (preflightStatus !== 'processed') {
      return preflightStatus;
    }

    await manager.upsert(
      ShopSnapshotModel,
      [
        {
          shopUuid: event.aggregateId,
          sourceVersion: event.aggregateVersion,
          name: this.stringPayload(event, 'name'),
          syncedAt: new Date(),
        },
      ],
      ['shopUuid'],
    );

    return 'processed';
  }

  private async applyProductEvent(manager: EntityManager, event: IntegrationEventDto): Promise<EventApplyStatus> {
    const payload = plainToInstance(ProductSnapshotPayloadDto, event.payload);
    await validateOrReject(payload, { whitelist: true });
    if (payload.uuid !== event.aggregateId || payload.version !== event.aggregateVersion) {
      throw new Error('Product event envelope does not match its payload');
    }

    const current = await manager.findOne(ProductSnapshotModel, { where: { productUuid: event.aggregateId } });

    const preflightStatus = await this.checkVersion(
      manager,
      event,
      current?.sourceProducer === 'product_srv_v2' ? current.sourceVersion : undefined,
    );

    if (preflightStatus !== 'processed') {
      return preflightStatus;
    }

    await manager.upsert(
      ProductSnapshotModel,
      [
        {
          productUuid: event.aggregateId,
          sourceProducer: 'product_srv_v2',
          sourceVersion: event.aggregateVersion,
          name: payload.name,
          status: payload.status,
          syncedAt: new Date(),
        },
      ],
      ['productUuid'],
    );

    if (payload.variants.some((variant) => variant.productUuid !== undefined && variant.productUuid !== payload.uuid))
      throw new Error('Variant event payload belongs to another product');

    if (payload.variants.length > 0) {
      await manager.upsert(
        VariantSnapshotModel,
        payload.variants.map((variant) => ({
          variantUuid: variant.uuid,
          productUuid: event.aggregateId,
          sourceVersion: event.aggregateVersion,
          name: variant.name,
          status: variant.status,
          syncedAt: new Date(),
        })),
        ['variantUuid'],
      );
    }

    return 'processed';
  }

  async synchronizeProduct(payload: ProductSnapshotPayloadDto): Promise<void> {
    await validateOrReject(payload, { whitelist: true });
    await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `product_srv_v2:product:${payload.uuid}`,
      ]);
      const current = await manager.findOneBy(ProductSnapshotModel, { productUuid: payload.uuid });
      if (current?.sourceProducer === 'product_srv_v2' && current.sourceVersion > payload.version) return;
      await manager.upsert(
        ProductSnapshotModel,
        {
          productUuid: payload.uuid,
          sourceProducer: 'product_srv_v2',
          sourceVersion: payload.version,
          name: payload.name,
          status: payload.status,
          syncedAt: new Date(),
        },
        ['productUuid'],
      );
      if (payload.variants.some((variant) => variant.productUuid !== undefined && variant.productUuid !== payload.uuid))
        throw new Error('Variant snapshot belongs to another product');
      if (payload.variants.length)
        await manager.upsert(
          VariantSnapshotModel,
          payload.variants.map((variant) => ({
            variantUuid: variant.uuid,
            productUuid: payload.uuid,
            sourceVersion: payload.version,
            name: variant.name,
            status: variant.status,
            syncedAt: new Date(),
          })),
          ['variantUuid'],
        );
      await manager.update(
        SyncIssueModel,
        {
          producer: 'product_srv_v2',
          aggregateType: 'product',
          aggregateId: payload.uuid,
          receivedVersion: LessThanOrEqual(payload.version),
          status: 'open',
        },
        { status: 'resolved', resolvedAt: new Date() },
      );
      await manager.update(
        InboxEventModel,
        {
          producer: 'product_srv_v2',
          aggregateType: 'product',
          aggregateId: payload.uuid,
          aggregateVersion: LessThanOrEqual(payload.version),
          status: 'parked',
        },
        { status: 'ignored', processedAt: new Date() },
      );
    });
  }

  private async checkVersion(
    manager: EntityManager,
    event: IntegrationEventDto,
    currentVersion?: number,
  ): Promise<EventApplyStatus> {
    if (currentVersion && event.aggregateVersion <= currentVersion) {
      return 'ignored';
    }

    const expectedVersion = currentVersion ? currentVersion + 1 : 1;

    if (event.aggregateVersion > expectedVersion) {
      await this.insertSyncIssue(manager, event, expectedVersion, 'version_gap');
      return 'parked';
    }

    return 'processed';
  }

  private async insertSyncIssue(
    manager: EntityManager,
    event: IntegrationEventDto,
    expectedVersion: number | null,
    reason: string,
  ) {
    const existing = await manager.findOne(SyncIssueModel, { where: { eventUuid: event.eventUuid, status: 'open' } });

    if (existing) {
      return;
    }

    await manager.insert(SyncIssueModel, {
      producer: event.producer,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      expectedVersion,
      receivedVersion: event.aggregateVersion,
      eventUuid: event.eventUuid,
      reason,
      payload: event.payload,
      status: 'open',
    });
  }

  private recordInboxEvent(
    manager: EntityManager,
    event: IntegrationEventDto,
    status: EventApplyStatus,
    attempts: number,
  ) {
    return manager.upsert(
      InboxEventModel,
      [
        {
          eventUuid: event.eventUuid,
          producer: event.producer,
          schemaVersion: event.schemaVersion,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          aggregateVersion: event.aggregateVersion,
          processedAt: status === 'processed' || status === 'ignored' ? new Date() : null,
          status,
          attempts: attempts + 1,
        },
      ],
      ['eventUuid'],
    );
  }

  private stringPayload(event: IntegrationEventDto, field: string) {
    return String(event.payload[field] ?? '');
  }
}
